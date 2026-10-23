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
import { AiSettings, BotReply, ExpenseProposal, TelegramUpdate } from './integration.schema';
import { SecretVault } from './secret-vault';
import { TelegramClient } from './telegram.client';

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

  private async reserveAiCall(userId: string) {
    const permitted = await this.repository.database.forUser(userId, (database) =>
      database.query(
        `UPDATE integration_settings
      SET ai_last_at=NOW(),ai_day=CURRENT_DATE,ai_count=CASE WHEN ai_day=CURRENT_DATE THEN ai_count+1 ELSE 1 END
      WHERE user_id=$1 AND (ai_last_at IS NULL OR ai_last_at<NOW()-INTERVAL '10 seconds')
      AND (ai_day IS NULL OR ai_day<>CURRENT_DATE OR ai_count<100) RETURNING user_id`,
        [userId],
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
        `UPDATE integration_settings SET telegram_user_id=candidate_id,telegram_name=candidate_name,
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

  async handle(update: TelegramUpdate): Promise<BotReply | null> {
    const message = update.message || update.callback_query?.message;
    const actor = update.callback_query?.from || update.message?.from;
    let reply: BotReply | null = null;
    if (
      message?.chat.type === 'private' &&
      actor &&
      !actor.is_bot &&
      String(message.chat.id) === String(actor.id)
    ) {
      const chatId = String(actor.id);
      const text = update.message?.text || '';
      const start = /^\/start ([A-Za-z0-9_-]{32})$/.exec(text);
      if (start) {
        const linked = await this.repository.database.query(
          `UPDATE integration_settings SET candidate_id=$2,candidate_name=$3
          WHERE link_hash=$1 AND link_expires_at>NOW() AND telegram_user_id IS NULL
          AND (candidate_id IS NULL OR candidate_id=$2) RETURNING user_id`,
          [hashToken(start[1]), chatId, actor.first_name || chatId],
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
          `SELECT i.*,u.language FROM integration_settings i JOIN users u ON u.id=i.user_id WHERE i.telegram_user_id=$1`,
          [chatId],
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
              await this.repository.disconnect(settings.user_id);
              reply = {
                chatId,
                text: english ? 'Telegram disconnected.' : 'Telegram desconectado.',
              };
            } else if (text.startsWith('/') || !text || text.length > 1500) {
              reply = {
                chatId,
                text: english
                  ? 'Send one complete expense: item, amount, payment account/card, and optionally date, reporting month and category. /disconnect unlinks this account. Text only; no installments or transfers.'
                  : 'Envie uma despesa completa: item, valor, conta/cartão e, se quiser, data, competência e categoria. /disconnect desvincula esta conta. Somente texto; sem parcelamentos ou transferências.',
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
                ? 'Unable to prepare this expense. Check your AI settings and limits, or resend a complete message. Nothing was added automatically.'
                : `${key || 'Não foi possível preparar a despesa. Confira sua configuração e reenvie a mensagem completa.'} Nenhum lançamento é feito sem confirmação.`,
            };
          }
          if (reply && text !== '/disconnect') {
            reply.ownerId = settings.user_id;
          }
        } else {
          reply = {
            chatId,
            text: 'Conecte sua conta em Configurações → Integrações no Finance Space. / Connect your account in Settings → Integrations in Finance Space.',
          };
        }
      }
    }
    return reply;
  }

  async canDeliver(reply: BotReply) {
    let permitted = true;
    if (reply.ownerId) {
      const settings = await this.repository.settings(reply.ownerId);
      permitted = settings?.telegram_user_id === reply.chatId;
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
      database.query<{ id: string; data: FinanceData }>(
        'SELECT id,data FROM telegram_drafts WHERE user_id=$1 AND update_id=$2',
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
      const proposal = await this.interpretExpense(settings, text, references, english);
      if (proposal.clarification) {
        reply = { chatId: settings.telegram_user_id!, text: proposal.clarification };
      } else {
        const data = this.expenseData(proposal, references);
        await this.repository.database.forUser(userId, async (database) => {
          await database.query(
            'SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE',
            [userId],
          );
          const current = await this.repository.settings(userId, database);
          if (
            current?.telegram_user_id === settings.telegram_user_id &&
            current.encrypted_key === settings.encrypted_key
          ) {
            await this.finance.validateLinks(userId, data, database);
            await database.query(
              'INSERT INTO telegram_drafts(id,user_id,update_id,data) VALUES($1,$2,$3,$4) ON CONFLICT(update_id) DO NOTHING',
              [randomUUID(), userId, updateId, JSON.stringify(data)],
            );
          } else {
            throw new BadRequestException(
              'A integração foi alterada. Reenvie a mensagem após conectar novamente.',
            );
          }
        });
        draft = (
          await this.repository.database.forUser(userId, (database) =>
            database.query<{ id: string; data: FinanceData }>(
              'SELECT id,data FROM telegram_drafts WHERE user_id=$1 AND update_id=$2',
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

  private async interpretExpense(
    settings: IntegrationSettings,
    text: string,
    references: FinanceRecord[],
    english: boolean,
  ) {
    let proposal: ExpenseProposal;
    if (references.length <= 300) {
      const credential = this.credential(settings);
      await this.reserveAiCall(settings.user_id);
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

  private expenseData(proposal: ExpenseProposal, references: FinanceRecord[]) {
    const paymentCount = Number(Boolean(proposal.accountId)) + Number(Boolean(proposal.cardId));
    let data: FinanceData;
    if (paymentCount === 1) {
      const self = references.find((record) => record.kind === 'people' && record.data.isSelf);
      data = parseRecordData('transactions', {
        description: proposal.description,
        amount: proposal.amount,
        date: proposal.date,
        month: proposal.month,
        nature: 'expense',
        status: proposal.cardId ? 'posted' : 'paid',
        ...(proposal.accountId ? { accountId: proposal.accountId } : {}),
        ...(proposal.cardId ? { cardId: proposal.cardId } : {}),
        ...(proposal.categoryId ? { categoryId: proposal.categoryId } : {}),
        ...(self ? { personId: self.id } : {}),
        note: '',
      });
    } else {
      throw new BadRequestException(
        'Informe uma conta ou cartão sem ambiguidade e reenvie a despesa completa.',
      );
    }
    return data;
  }

  private draftReply(
    settings: IntegrationSettings,
    draft: { id: string; data: FinanceData },
    references: { id: string; data: FinanceData }[],
    english: boolean,
  ): BotReply {
    const data = draft.data;
    const name = (id: unknown) =>
      references.find((record) => record.id === id)?.data.name ||
      (english ? 'Not set' : 'Não informada');
    const amount = new Intl.NumberFormat(english ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(data.amount) / 100);
    return {
      chatId: settings.telegram_user_id!,
      text: `${english ? 'Review expense' : 'Confira a despesa'}\n${data.description}\n${amount}\n${english ? 'Date' : 'Data'}: ${data.date}\n${english ? 'Reporting month' : 'Competência'}: ${data.month}\n${data.cardId ? (english ? 'Card' : 'Cartão') : english ? 'Account' : 'Conta'}: ${name(data.cardId || data.accountId)}\n${english ? 'Category' : 'Categoria'}: ${name(data.categoryId)}\n\n${english ? 'Expires in 24 hours. To correct, cancel and resend a complete message.' : 'Expira em 24 horas. Para corrigir, cancele e reenvie uma mensagem completa.'}`,
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
          state: string;
          valid: boolean;
        }>(
          'SELECT id,data,state,expires_at>NOW() AS valid FROM telegram_drafts WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [match[2], settings.user_id],
        );
        let response = english
          ? 'Draft unavailable or expired.'
          : 'Rascunho indisponível ou expirado.';
        const draft = drafts[0];
        if (draft?.state === 'confirmed') {
          response = english
            ? 'Expense already registered; no duplicate was created.'
            : 'Despesa já registrada; nenhum lançamento duplicado foi criado.';
        } else if (
          draft?.state === 'pending' &&
          draft.valid &&
          current?.telegram_user_id === settings.telegram_user_id &&
          current.encrypted_key
        ) {
          if (match[1] === 'confirm') {
            await database.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [settings.user_id]);
            const data = parseRecordData('transactions', draft.data);
            await this.finance.validateLinks(settings.user_id, data, database);
            const id = randomUUID();
            await database.query(
              "INSERT INTO records(id,user_id,kind,data) VALUES($1,$2,'transactions',$3)",
              [id, settings.user_id, JSON.stringify(data)],
            );
            await database.query(
              "UPDATE telegram_drafts SET state='confirmed',record_id=$1 WHERE id=$2 AND user_id=$3",
              [id, draft.id, settings.user_id],
            );
            response = english
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
