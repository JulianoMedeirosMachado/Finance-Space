import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, QueryExecutor } from '../database/database.service';
import { FinanceData, FinanceRecord, parseRecordData, ResourceKind } from './finance.schema';
import { monthlyEntries, summarize, addMonths } from './calculations';

@Injectable()
export class FinanceService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(userId: string) {
    return this.database.forUser(userId, (executor) =>
      executor.query<FinanceRecord & Record<string, unknown>>(
        'SELECT id,kind,data,version,created_at,updated_at FROM records WHERE user_id=$1 ORDER BY created_at,id',
        [userId],
      ),
    );
  }

  async validateLinks(userId: string, data: FinanceData, executor: QueryExecutor) {
    const invalidFields: string[] = [];
    const mapping: Record<string, ResourceKind> = {
      accountId: 'accounts',
      destinationAccountId: 'accounts',
      cardId: 'cards',
      personId: 'people',
      categoryId: 'categories',
      goalId: 'goals',
    };
    for (const [field, kind] of Object.entries(mapping)) {
      if (data[field]) {
        const matches = await executor.query(
          'SELECT id FROM records WHERE id=$1 AND user_id=$2 AND kind=$3',
          [data[field], userId, kind],
        );
        if (matches.length !== 1) {
          invalidFields.push(field);
        }
      }
    }
    if (data.sourceId) {
      const source = await executor.query(
        "SELECT id FROM records WHERE id=$1 AND user_id=$2 AND kind IN ('recurring','income','installments')",
        [data.sourceId, userId],
      );
      if (source.length !== 1) {
        invalidFields.push('sourceId');
      }
    }
    if (invalidFields.length) {
      throw new BadRequestException(`Referências inválidas: ${invalidFields.join(', ')}.`);
    }
  }

  async save(userId: string, kind: ResourceKind, input: unknown, id?: string, version?: number) {
    const data = parseRecordData(kind, input);
    const result = await this.database.forUser(userId, async (database) => {
      await database.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      await this.validateLinks(userId, data, database);
      let duplicate = false;
      if (kind === 'invoices' || (kind === 'transactions' && data.sourceId)) {
        const field = kind === 'invoices' ? 'cardId' : 'sourceId';
        const matches = await database.query(
          "SELECT id FROM records WHERE user_id=$1 AND kind=$2 AND data->>'month'=$3 AND data->>$4=$5 AND ($6::uuid IS NULL OR id<>$6::uuid)",
          [userId, kind, data.month, field, data[field], id || null],
        );
        duplicate = matches.length > 0;
      }
      let saved: Record<string, unknown>[] = [];
      if (!duplicate) {
        if (id) {
          saved = await database.query(
            'UPDATE records SET data=$1,version=version+1,updated_at=NOW() WHERE id=$2 AND user_id=$3 AND kind=$4 AND version=$5 RETURNING id,kind,data,version',
            [JSON.stringify(data), id, userId, kind, version],
          );
          if (!saved[0]) {
            throw new ConflictException('O registro foi alterado ou removido. Atualize a página.');
          }
        } else {
          saved = await database.query(
            'INSERT INTO records(id,user_id,kind,data) VALUES($1,$2,$3,$4) RETURNING id,kind,data,version',
            [randomUUID(), userId, kind, JSON.stringify(data)],
          );
        }
      } else {
        throw new ConflictException('Já existe um registro para esta origem e competência.');
      }
      return saved[0];
    });
    return result;
  }

  async remove(userId: string, id: string) {
    await this.database.forUser(userId, async (database) => {
      await database.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      const references = await database.query(
        "SELECT id FROM records WHERE user_id=$1 AND id<>$2 AND (data->>'accountId'=$2::text OR data->>'destinationAccountId'=$2::text OR data->>'cardId'=$2::text OR data->>'personId'=$2::text OR data->>'categoryId'=$2::text OR data->>'sourceId'=$2::text OR data->>'goalId'=$2::text) LIMIT 1",
        [userId, id],
      );
      if (references.length === 0) {
        const deleted = await database.query(
          'DELETE FROM records WHERE id=$1 AND user_id=$2 RETURNING id',
          [id, userId],
        );
        if (!deleted.length) {
          throw new NotFoundException('Registro não encontrado.');
        }
      } else {
        throw new ConflictException(
          'Há registros vinculados. Remova os vínculos ou desative este cadastro.',
        );
      }
    });
    return { success: true };
  }

  async dashboard(userId: string, month: string) {
    const records = await this.list(userId);
    const current = summarize(records, month);
    const trend = Array.from({ length: 6 }, (_, index) => {
      const period = addMonths(month, index - 2);
      const summary = summarize(records, period);
      return {
        month: period,
        income: summary.income,
        expenses: summary.expenses,
        investments: summary.investments,
        freeBalance: summary.freeBalance,
      };
    });
    return { ...current, trend };
  }

  async realize(userId: string, month: string, sourceId: string, accountId?: string) {
    const records = await this.list(userId);
    const entry = monthlyEntries(records, month).find(
      (value) => value.sourceId === sourceId && value.sourceKind !== 'transactions',
    );
    let result;
    if (entry) {
      const {
        sourceKind,
        id,
        installment,
        active,
        startMonth,
        endMonth,
        remainingAmount,
        count,
        day,
        ...data
      } = entry;
      result = await this.save(userId, 'transactions', {
        ...data,
        date: entry.date,
        status: 'paid',
        accountId: accountId || entry.accountId,
      });
    } else {
      throw new NotFoundException('Previsão não encontrada ou já realizada.');
    }
    return result;
  }
}
