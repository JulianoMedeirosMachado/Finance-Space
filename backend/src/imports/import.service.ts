import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FinanceService } from '../finance/finance.service';
import { summarize } from '../finance/calculations';
import { FinanceRecord } from '../finance/finance.schema';
import { readWorkbook, WorkbookPreview } from './workbook-reader';

@Injectable()
export class ImportService {
  private previews = new Map<
    string,
    WorkbookPreview & { userId: string; filename: string; fingerprint: string; expires: number }
  >();
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}

  async preview(userId: string, filename: string, buffer: Buffer) {
    const fingerprint = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.database.query<FinanceRecord & Record<string, unknown>>(
      'SELECT id,kind,data,version,import_key FROM records WHERE user_id=$1',
      [userId],
    );
    const result = await readWorkbook(buffer, existing);
    const known = await this.database.query(
      'SELECT id FROM imports WHERE user_id=$1 AND fingerprint=$2',
      [userId, fingerprint],
    );
    const projected = [
      ...existing,
      ...result.items
        .filter((item) => !item.duplicate)
        .map((item) => ({ id: item.id, kind: item.kind, data: item.data, version: 1 })),
    ];
    const comparison = result.controls ? summarize(projected, result.controls.month) : null;
    const id = randomUUID();
    for (const [key, value] of this.previews) {
      if (value.expires < Date.now() || value.userId === userId) {
        this.previews.delete(key);
      }
    }
    if (this.previews.size < 30) {
      this.previews.set(id, {
        ...result,
        userId,
        filename,
        fingerprint,
        expires: Date.now() + 30 * 60000,
      });
    } else {
      throw new BadRequestException(
        'Há muitas importações em análise. Tente novamente mais tarde.',
      );
    }
    return {
      ...result,
      id,
      alreadyImported: known.length > 0,
      comparison: comparison
        ? {
            month: comparison.month,
            income: comparison.income,
            expenses: comparison.expenses,
            investments: comparison.investments,
            freeBalance: comparison.freeBalance,
            benefitSpent: comparison.benefits.spent,
            benefitCredit: comparison.benefits.credits,
          }
        : null,
    };
  }

  async confirm(userId: string, id: string, excluded: string[]) {
    const preview = this.previews.get(id);
    let summary: Record<string, number> = {};
    if (preview && preview.userId === userId && preview.expires > Date.now()) {
      if (preview.errors.length === 0) {
        const selected = preview.items.filter(
          (item) => !item.duplicate && !excluded.includes(item.id),
        );
        summary = await this.database.transaction(async (database) => {
          await database.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
          const counts: Record<string, number> = {};
          const sorted = [...selected].sort(
            (left, right) =>
              Number(!['cards', 'people', 'categories'].includes(left.kind)) -
              Number(!['cards', 'people', 'categories'].includes(right.kind)),
          );
          for (const item of sorted) {
            await this.finance.validateLinks(userId, item.data, database);
            const saved = await database.query(
              'INSERT INTO records(id,user_id,kind,data,import_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,import_key) DO NOTHING RETURNING id',
              [item.id, userId, item.kind, JSON.stringify(item.data), item.key],
            );
            counts[item.kind] = (counts[item.kind] || 0) + saved.length;
          }
          await database.query(
            'INSERT INTO imports(id,user_id,filename,fingerprint,summary) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,fingerprint) DO UPDATE SET summary=EXCLUDED.summary',
            [randomUUID(), userId, preview.filename, preview.fingerprint, JSON.stringify(counts)],
          );
          return counts;
        });
        this.previews.delete(id);
      } else {
        throw new BadRequestException('Corrija os erros da planilha e envie novamente.');
      }
    } else {
      throw new NotFoundException('Prévia expirada. Envie a planilha novamente.');
    }
    return { summary };
  }

  async history(userId: string) {
    return this.database.query(
      'SELECT id,filename,summary,created_at FROM imports WHERE user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
  }
}
