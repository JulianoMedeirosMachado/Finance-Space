import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken } from '../auth/auth.service';
import { FinanceService } from '../finance/finance.service';
import { FinanceData, FinanceRecord, parseRecordData } from '../finance/finance.schema';
import { AiCredential, AiService } from './ai.service';
import { IntegrationRepository, IntegrationSettings } from './integration.repository';
import { AiSettings, BotReply, EntryProposal, TelegramUpdate } from './integration.schema';
import { SecretVault } from './secret-vault';
import { TelegramClient } from './telegram.client';
import { TelegramDraft, TelegramSplitEntry } from './telegram-entry';
import { buildTelegramProposal, validatedDraftEntries } from './telegram-split';
import { telegramSplitPreview } from './telegram-split-preview';
import { addMonths } from '../finance/calculations';
import { TelegramContext } from './telegram-context';

@Injectable()
export class IntegrationService {
  readonly vault = new SecretVault();
  constructor(
    @Inject(IntegrationRepository) readonly repository: IntegrationRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(TelegramClient) private readonly telegram: TelegramClient,
  ) {}

  async status(userId: string) {
    const settings = await this.repository.settings(userId);
    const pending =
      settings?.candidate_id &&
      settings.link_expires_at &&
      new Date(settings.link_expires_at).getTime() > Date.now();
    return {
      aiAvailable: this.vault.available(),
      telegramAvailable: this.telegram.available(),
      provider: settings?.provider || 'deepseek',
      model: settings?.model || '',
      hasKey: Boolean(settings?.encrypted_key),
      insightsEnabled: Boolean(settings?.insights_enabled),
      telegram: settings?.telegram_user_id
        ? { id: settings.telegram_user_id, name: settings.telegram_name }
        : null,
      candidate: pending ? { id: settings.candidate_id, name: settings.candidate_name } : null,
    };
  }

  async saveAi(userId: string, input: AiSettings) {
    const stored = await this.repository.settings(userId);
    let encrypted: string;
    if (input.apiKey) {
      encrypted = this.vault.encrypt(input.apiKey, userId);
    } else if (stored?.encrypted_key && stored.provider === input.provider) {
      encrypted = stored.encrypted_key;
    } else {
      throw new BadRequestException('Informe a chave de API do provedor selecionado.');
    }
    await this.repository.saveAi(userId, input, encrypted);
    return this.status(userId);
  }

  private credential(settings: IntegrationSettings) {
    let credential: AiCredential;
    if (settings.provider && settings.model && settings.encrypted_key) {
      credential = {
        provider: settings.provider,
        model: settings.model,
        apiKey: this.vault.decrypt(settings.encrypted_key, settings.user_id),
      };
    } else {
      throw new BadRequestException('Configure sua IA no site antes de usar o bot.');
    }
    return credential;
  }

  async prepareAiCall(userId: string, insightsVersion?: number) {
    const settings = await this.repository.settings(userId);
    let credential: AiCredential;
    if (
      settings &&
      (insightsVersion === undefined ||
        (settings.insights_enabled && settings.insights_version === insightsVersion))
    ) {
      credential = this.credential(settings);
      await this.reserveAiCall(userId);
    } else {
      throw new BadRequestException(
        'Confira sua chave e a autorização dos insights na Integração IA.',
      );
    }
    return credential;
  }

  async setInsightsEnabled(userId: string, enabled: boolean) {
    await this.repository.database.forUser(userId, async (database) => {
      await database.query('SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE', [
        userId,
      ]);
      const settings = await this.repository.settings(userId, database);
      if (!enabled || (settings?.encrypted_key && this.vault.available())) {
        await database.query(
          `INSERT INTO integration_settings(user_id,insights_enabled,insights_version) VALUES($1,$2,1)
          ON CONFLICT(user_id) DO UPDATE SET insights_enabled=$2,insights_version=integration_settings.insights_version+1`,
          [userId, enabled],
        );
      } else {
        throw new BadRequestException('Salve uma chave de IA antes de habilitar os insights.');
      }
    });
    return this.status(userId);
  }

  async testAi(userId: string) {
    const settings = await this.repository.settings(userId);
    let result: { success: boolean };
    if (settings) {
      await this.reserveAiCall(userId);
      result = await this.ai.test(this.credential(settings));
    } else {
      throw new BadRequestException('Configure sua IA no site antes de usar o bot.');
    }
    return result;
  }

  private async reserveAiCall(userId: string, binding?: { actorId: string; version: number }) {
    const permitted = await this.repository.database.forUser(userId, (database) =>
      database.query(
        `UPDATE integration_settings
      SET ai_last_at=NOW(),ai_day=CURRENT_DATE,ai_count=CASE WHEN ai_day=CURRENT_DATE THEN ai_count+1 ELSE 1 END
      WHERE user_id=$1 AND (ai_last_at IS NULL OR ai_last_at<NOW()-INTERVAL '10 seconds')
      AND ($2::text IS NULL OR (telegram_user_id=$2 AND telegram_link_version=$3))
      AND (ai_day IS NULL OR ai_day<>CURRENT_DATE OR ai_count<100) RETURNING user_id`,
        [userId, binding?.actorId ?? null, binding?.version ?? null],
      ),
    );
    if (permitted.length === 0) {
      throw new BadRequestException('Limite da IA atingido. Aguarde e tente novamente.');
    }
  }

  async startLink(userId: string) {
    const token = randomBytes(24).toString('base64url');
    if (this.telegram.available()) {
      await this.repository.database.forUser(userId, async (database) => {
        const settings = await this.repository.settings(userId, database);
        if (!settings?.telegram_user_id) {
          await database.query(
            `INSERT INTO integration_settings(user_id,link_hash,link_expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')
        ON CONFLICT(user_id) DO UPDATE SET link_hash=$2,link_expires_at=NOW()+INTERVAL '10 minutes',candidate_id=NULL,candidate_name=NULL`,
            [userId, hashToken(token)],
          );
        } else {
          throw new ConflictException('Desconecte o Telegram atual antes de vincular outro.');
        }
      });
    } else {
      throw new ServiceUnavailableException('Integrações não configuradas no servidor.');
    }
    return { url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}` };
  }

  async confirmLink(userId: string, candidateId: string) {
    await this.repository.database.forUser(userId, async (database) => {
      const changed = await database.query(
        `UPDATE integration_settings SET telegram_user_id=candidate_id,telegram_name=candidate_name,telegram_link_version=telegram_link_version+1,
        link_hash=NULL,link_expires_at=NULL,candidate_id=NULL,candidate_name=NULL
        WHERE user_id=$1 AND candidate_id=$2 AND link_expires_at>NOW() AND telegram_user_id IS NULL RETURNING user_id`,
        [userId, candidateId],
      );
      if (changed.length === 0) {
        throw new BadRequestException('Vínculo inválido ou expirado. Gere um novo link.');
      }
    });
    return this.status(userId);
  }

  async handle(
    update: TelegramUpdate,
    receivedContext?: TelegramContext,
  ): Promise<BotReply | null> {
    const context = receivedContext ?? (await this.repository.telegramContext(update));
    const message = update.message || update.callback_query?.message;
    const actor = update.callback_query?.from || update.message?.from;
    let reply: BotReply | null = null;
    if (
      message?.chat.type === 'private' &&
      actor &&
      !actor.is_bot &&
      String(message.chat.id) === String(actor.id) &&
      context?.actorId === String(actor.id)
    ) {
      const chatId = String(actor.id);
      const text = update.message?.text || '';
      const start = /^\/start ([A-Za-z0-9_-]{32})$/.exec(text);
      if (start && context.ownerId && context.linkHash === hashToken(start[1])) {
        const linked = await this.repository.database.query(
          `UPDATE integration_settings SET candidate_id=$2,candidate_name=$3
          WHERE link_hash=$1 AND link_expires_at>NOW() AND telegram_user_id IS NULL
          AND user_id=$4 AND telegram_link_version=$5
          AND (candidate_id IS NULL OR candidate_id=$2) RETURNING user_id`,
          [
            context.linkHash,
            chatId,
            actor.first_name || chatId,
            context.ownerId,
            context.bindingVersion,
          ],
        );
        reply = {
          chatId,
          text: linked.length
            ? 'Volte ao Finance Space para confirmar este vínculo. / Return to Finance Space to confirm this connection.'
            : 'Link inválido ou expirado. / Invalid or expired link.',
        };
      } else {
        const rows = await this.repository.database.query<
          IntegrationSettings & { language: string }
        >(
          `SELECT i.*,u.language FROM integration_settings i JOIN users u ON u.id=i.user_id
          WHERE i.telegram_user_id=$1 AND i.user_id=$2 AND i.telegram_link_version=$3`,
          [chatId, context.linkHash ? null : context.ownerId, context.bindingVersion],
        );
        if (rows[0]) {
          const settings = rows[0];
          const english = settings.language === 'en-US';
          try {
            if (update.callback_query) {
              reply = await this.handleCallback(
                settings,
                update.callback_query.data || '',
                english,
              );
            } else if (text === '/disconnect') {
              const disconnected = await this.repository.disconnect(
                settings.user_id,
                settings.telegram_link_version,
              );
              reply = disconnected
                ? {
                    chatId,
                    text: english ? 'Telegram disconnected.' : 'Telegram desconectado.',
                  }
                : null;
            } else if (text.startsWith('/') || !text || text.length > 1500) {
              reply = {
                chatId,
                text: english
                  ? 'Send one complete entry: item, amount, account/card, and optionally date, reporting month, category and a registered responsible person for expenses. Subscription: "Streaming 30 monthly on ML, day 10" (monthly planned schedule). Income: "Received 20 for a sale into Checking" (account required, no card). Monthly income: "Salary 3000 monthly into Checking, day 5" (planned). Installments: total and count, or explicitly each installment amount. Shared purchase: Gas 150, me, Marta and Cacau on ML in 3 installments; Marta pays 50%. Without percentages the split is equal; unspecified participants share the remainder. Check every share in the preview before confirming. /disconnect unlinks this account. Text only; no transfers or reimbursements.'
                  : 'Envie um lançamento completo: item, valor, conta/cartão e, se quiser, data, competência, categoria e responsável cadastrado para despesas. Assinatura: "Streaming 30 mensal no ML, dia 10" (previsão mensal). Receita: "Receita de 20 pela venda na conta Corrente" (precisa de conta, sem cartão). Receita mensal: "Salário 3000 todo mês na conta Corrente, dia 5" (previsão). Parcelamento: total e quantidade ou o valor explícito de cada parcela. Compra dividida: gas 150, eu, Marta e Cacau no ML em 3x; Marta paga 50%. Sem percentuais a divisão é igual; os demais dividem o restante. Confira todas as partes na prévia antes de confirmar. /disconnect desvincula esta conta. Somente texto; sem transferências ou reembolsos.',
              };
            } else {
              reply = await this.propose(settings, update.update_id, text, english);
            }
          } catch (error) {
            const key =
              error instanceof BadRequestException || error instanceof ServiceUnavailableException
                ? error.message
                : '';
            reply = {
              chatId,
              text: english
                ? 'Unable to prepare this entry. Check your AI settings and limits, or resend a complete message. Nothing was added automatically.'
                : `${key || 'Não foi possível preparar o lançamento. Confira sua configuração e reenvie a mensagem completa.'} Nenhum lançamento é feito sem confirmação.`,
            };
          }
          if (reply && text !== '/disconnect') {
            reply.ownerId = settings.user_id;
            reply.bindingVersion = settings.telegram_link_version;
          }
        } else if (!context.ownerId) {
          reply = {
            chatId,
            text: 'Conecte sua conta em Configurações → Integração IA no Finance Space. / Connect your account in Settings → AI integration in Finance Space.',
          };
        }
      }
    }
    return reply;
  }

  async canDeliver(reply: BotReply, context?: TelegramContext) {
    let permitted = true;
    if (context && reply.chatId !== context.actorId) {
      permitted = false;
    } else if (reply.ownerId) {
      const settings = await this.repository.settings(reply.ownerId);
      permitted =
        settings?.telegram_user_id === reply.chatId &&
        settings.telegram_link_version === reply.bindingVersion &&
        (!context ||
          (context.ownerId === reply.ownerId && context.bindingVersion === reply.bindingVersion));
    }
    return permitted;
  }

  private async propose(
    settings: IntegrationSettings,
    updateId: number,
    text: string,
    english: boolean,
  ): Promise<BotReply> {
    const userId = settings.user_id;
    const existing = await this.repository.database.forUser(userId, (database) =>
      database.query<TelegramDraft & Record<string, unknown>>(
        'SELECT id,data,kind,split_entries FROM telegram_drafts WHERE user_id=$1 AND update_id=$2',
        [userId, updateId],
      ),
    );
    const references = await this.repository.database.forUser(userId, (database) =>
      database.query<FinanceRecord & Record<string, unknown>>(
        "SELECT id,kind,data,version FROM records WHERE user_id=$1 AND kind IN ('accounts','cards','categories','people') ORDER BY id LIMIT 301",
        [userId],
      ),
    );
    let draft = existing[0];
    let reply: BotReply;
    if (!draft) {
      const proposal = await this.interpretEntry(settings, text, references, english);
      if (proposal.clarification) {
        reply = { chatId: settings.telegram_user_id!, text: proposal.clarification };
      } else {
        const built = buildTelegramProposal(proposal, references, text);
        const { data, kind, split_entries } = built;
        const records = validatedDraftEntries(built);
        await this.repository.database.forUser(userId, async (database) => {
          await database.query(
            'SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE',
            [userId],
          );
          const current = await this.repository.settings(userId, database);
          if (
            current?.telegram_user_id === settings.telegram_user_id &&
            current.telegram_link_version === settings.telegram_link_version &&
            current.encrypted_key === settings.encrypted_key
          ) {
            for (const entry of records) {
              await this.finance.validateLinks(userId, entry, database);
            }
            await database.query(
              'INSERT INTO telegram_drafts(id,user_id,update_id,data,kind,split_entries) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(update_id) DO NOTHING',
              [
                randomUUID(),
                userId,
                updateId,
                JSON.stringify(data),
                kind,
                split_entries ? JSON.stringify(split_entries) : null,
              ],
            );
          } else {
            throw new BadRequestException(
              'A integração foi alterada. Reenvie a mensagem após conectar novamente.',
            );
          }
        });
        draft = (
          await this.repository.database.forUser(userId, (database) =>
            database.query<TelegramDraft & Record<string, unknown>>(
              'SELECT id,data,kind,split_entries FROM telegram_drafts WHERE user_id=$1 AND update_id=$2',
              [userId, updateId],
            ),
          )
        )[0];
        reply = this.draftReply(settings, draft, references, english);
      }
    } else {
      reply = this.draftReply(settings, draft, references, english);
    }
    return reply;
  }

  private async interpretEntry(
    settings: IntegrationSettings,
    text: string,
    references: FinanceRecord[],
    english: boolean,
  ) {
    let proposal: EntryProposal;
    if (references.length <= 300) {
      const credential = this.credential(settings);
      await this.reserveAiCall(settings.user_id, {
        actorId: settings.telegram_user_id!,
        version: settings.telegram_link_version,
      });
      proposal = await this.ai.interpret(
        credential,
        text,
        references,
        english ? 'English' : 'Brazilian Portuguese',
      );
    } else {
      throw new BadRequestException('Há cadastros demais para interpretar pelo bot. Use o site.');
    }
    return proposal;
  }

  private draftReply(
    settings: IntegrationSettings,
    draft: TelegramDraft,
    references: { id: string; data: FinanceData }[],
    english: boolean,
  ): BotReply {
    const data = draft.data;
    const name = (id: unknown) => {
      const value = String(
        references.find((record) => record.id === id)?.data.name ||
          (english ? 'Not set' : 'Não informada'),
      );
      return draft.split_entries && value.length > 120 ? `${value.slice(0, 117)}…` : value;
    };
    const amount = new Intl.NumberFormat(english ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(data.amount) / 100);
    const money = (value: number) =>
      new Intl.NumberFormat(english ? 'en-US' : 'pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value / 100);
    const schedule =
      draft.kind === 'installments'
        ? `\n${english ? 'Installment plan' : 'Parcelamento'}: ${data.count} × ${amount}\n${english ? 'Last installment' : 'Última parcela'}: ${money(Number(data.finalAmount ?? data.amount))}\n${english ? 'Total' : 'Total'}: ${money(Number(data.amount) * (Number(data.count) - 1) + Number(data.finalAmount ?? data.amount))}\n${english ? 'First reporting month' : 'Primeira competência'}: ${data.startMonth}\n${english ? 'Last reporting month' : 'Última competência'}: ${addMonths(String(data.startMonth), Number(data.count) - 1)}`
        : draft.kind === 'recurring' || draft.kind === 'income'
          ? `\n${english ? 'Monthly amount' : 'Valor mensal'}: ${amount}\n${english ? 'First reporting month' : 'Primeira competência'}: ${data.startMonth}\n${english ? 'Day' : 'Dia'}: ${data.day}\n${english ? 'Last reporting month' : 'Última competência'}: ${data.endMonth || (english ? 'No end date' : 'Sem término')}\n${english ? 'Planned monthly schedule only; no payment or receipt is marked as completed.' : 'Somente previsão mensal; nenhum pagamento ou recebimento é marcado como realizado.'}`
          : `\n${amount}\n${english ? 'Date' : 'Data'}: ${data.date}\n${english ? 'Reporting month' : 'Competência'}: ${data.month}`;
    const type =
      draft.kind === 'recurring'
        ? english
          ? 'Subscription / recurring expense'
          : 'Assinatura / despesa recorrente'
        : draft.kind === 'income'
          ? english
            ? 'Recurring income (planned)'
            : 'Receita recorrente (prevista)'
          : data.nature === 'income'
            ? english
              ? 'Income received'
              : 'Receita recebida'
            : english
              ? 'Expense'
              : 'Despesa';
    const split = telegramSplitPreview(draft, references, english);
    return {
      chatId: settings.telegram_user_id!,
      text: `${english ? 'Review the AI proposal' : 'Confira a proposta da IA'}\n${english ? 'Type' : 'Tipo'}: ${type}\n${data.description}${schedule}\n${data.cardId ? (english ? 'Suggested card' : 'Cartão sugerido') : english ? 'Suggested account' : 'Conta sugerida'}: ${name(data.cardId || data.accountId)}\n${english ? 'Suggested category' : 'Categoria sugerida'}: ${name(data.categoryId)}${split || `\n${english ? 'Responsible person' : 'Responsável'}: ${data.personId ? name(data.personId) : english ? 'You' : 'Você'}`}\n\n${english ? 'Names and abbreviations may have been interpreted. Check the account/card and responsible person before confirming. No reimbursement is marked as received. Expires in 24 hours. To correct, cancel and resend a complete message.' : 'Nomes e siglas podem ter sido interpretados. Confira a conta/cartão e o responsável antes de confirmar. Nenhum reembolso é marcado como recebido. Expira em 24 horas. Para corrigir, cancele e reenvie uma mensagem completa.'}`,
      buttons: [
        [
          { text: english ? 'Confirm' : 'Confirmar', callback_data: `confirm:${draft.id}` },
          {
            text: english ? 'Cancel / correct' : 'Cancelar / corrigir',
            callback_data: `cancel:${draft.id}`,
          },
        ],
      ],
    };
  }

  private async handleCallback(
    settings: IntegrationSettings,
    callback: string,
    english: boolean,
  ): Promise<BotReply> {
    const match = /^(confirm|cancel):([a-f0-9-]{36})$/.exec(callback);
    let result = english ? 'Draft unavailable or expired.' : 'Rascunho indisponível ou expirado.';
    if (match) {
      result = await this.repository.database.forUser(settings.user_id, async (database) => {
        await database.query(
          'SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE',
          [settings.user_id],
        );
        const current = await this.repository.settings(settings.user_id, database);
        const drafts = await database.query<{
          id: string;
          data: FinanceData;
          kind: TelegramDraft['kind'];
          split_entries: TelegramSplitEntry[] | null;
          state: string;
          valid: boolean;
        }>(
          'SELECT id,data,kind,split_entries,state,expires_at>NOW() AS valid FROM telegram_drafts WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [match[2], settings.user_id],
        );
        let response = english
          ? 'Draft unavailable or expired.'
          : 'Rascunho indisponível ou expirado.';
        const draft = drafts[0];
        if (draft?.state === 'confirmed') {
          response = english
            ? 'Entry already registered; no duplicate was created.'
            : 'Lançamento já registrado; nenhum lançamento duplicado foi criado.';
        } else if (
          draft?.state === 'pending' &&
          draft.valid &&
          current?.telegram_user_id === settings.telegram_user_id &&
          current.telegram_link_version === settings.telegram_link_version &&
          current.encrypted_key
        ) {
          if (match[1] === 'confirm') {
            await database.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [settings.user_id]);
            const data = parseRecordData(draft.kind, draft.data);
            const entries = validatedDraftEntries(draft);
            for (const entry of entries) {
              await this.finance.validateLinks(settings.user_id, entry, database);
            }
            const ids = entries.map(() => randomUUID());
            for (const [index, entry] of entries.entries()) {
              await database.query(
                'INSERT INTO records(id,user_id,kind,data) VALUES($1,$2,$3,$4)',
                [ids[index], settings.user_id, draft.kind, JSON.stringify(entry)],
              );
            }
            await database.query(
              "UPDATE telegram_drafts SET state='confirmed',record_id=$1 WHERE id=$2 AND user_id=$3",
              [ids[0], draft.id, settings.user_id],
            );
            response = draft.split_entries
              ? english
                ? 'Shared purchase registered! Each participant has one entry; the purchase total was not duplicated. Review the entries in Finance Space.'
                : 'Compra compartilhada registrada! Cada participante tem uma parte; o total da compra não foi duplicado. Confira os lançamentos no Finance Space.'
              : draft.kind === 'installments'
                ? english
                  ? 'Installment plan registered! Fine-tune it under Installments in Finance Space.'
                  : 'Parcelamento registrado! Faça os ajustes finos em Parcelamentos no Finance Space.'
                : draft.kind === 'recurring' || draft.kind === 'income'
                  ? english
                    ? 'Monthly schedule registered! Manage and post each occurrence in Finance Space; nothing was marked as paid or received.'
                    : 'Recorrência mensal registrada! Gerencie e realize cada ocorrência no Finance Space; nada foi marcado como pago ou recebido.'
                  : data.nature === 'income'
                    ? english
                      ? 'Income registered! You can edit it in Finance Space.'
                      : 'Receita registrada! Você pode editá-la no Finance Space.'
                    : english
                      ? 'Expense registered! You can edit it in Finance Space.'
                      : 'Despesa registrada! Você pode editá-la no Finance Space.';
          } else {
            await database.query(
              "UPDATE telegram_drafts SET state='cancelled' WHERE id=$1 AND user_id=$2",
              [draft.id, settings.user_id],
            );
            response = english
              ? 'Cancelled. Resend a complete message to correct it.'
              : 'Cancelado. Reenvie uma mensagem completa para corrigir.';
          }
        }
        return response;
      });
    }
    return { chatId: settings.telegram_user_id!, text: result };
  }
}
