import ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  FinanceData,
  FinanceRecord,
  parseRecordData,
  ResourceKind,
} from '../finance/finance.schema';

export interface ImportItem {
  id: string;
  kind: ResourceKind;
  data: FinanceData;
  key: string;
  source: string;
  duplicate: boolean;
}
export interface WorkbookPreview {
  items: ImportItem[];
  warnings: string[];
  errors: string[];
  controls: {
    month: string;
    income: number;
    expenses: number;
    investments: number;
    freeBalance: number;
    benefitSpent: number;
    benefitCredit: number;
  } | null;
}

function cellValue(row: ExcelJS.Row, column: number): unknown {
  const cell = row.getCell(column);
  const value = cell.value;
  let result: unknown = value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('formula' in value || 'sharedFormula' in value) {
      result = (value as ExcelJS.CellFormulaValue).result;
    } else if ('richText' in value) {
      result = value.richText.map((part) => part.text).join('');
    } else if ('text' in value) {
      result = value.text;
    }
  }
  return result;
}
const text = (value: unknown) => String(value ?? '').trim();
const cents = (value: unknown) => {
  let amount: number;
  if (typeof value === 'number' && Number.isFinite(value)) {
    amount = Math.round(value * 100);
  } else {
    throw new Error('Valor monetário ausente ou inválido.');
  }
  return amount;
};
function isoDate(value: unknown) {
  let result: string;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    result = value.toISOString().slice(0, 10);
  } else if (typeof value === 'number') {
    result = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  } else if (/^\d{4}-\d{2}(-\d{2})?$/.test(text(value))) {
    result = text(value).length === 7 ? `${value}-01` : text(value);
  } else {
    throw new Error('Competência ou data ausente/inválida.');
  }
  return result;
}
const natureOf = (value: unknown) =>
  ({ Receita: 'income', Despesa: 'expense', Investimento: 'investment' })[text(value)] || 'expense';
const statusOf = (value: unknown) =>
  ({ Previsto: 'planned', Lançado: 'posted', Pago: 'paid', Cancelado: 'cancelled', '✅': 'paid' })[
    text(value)
  ] || 'planned';

export async function readWorkbook(
  buffer: Buffer,
  existing: FinanceRecord[],
): Promise<WorkbookPreview> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new BadRequestException(
      'Não foi possível ler o arquivo. Envie uma planilha .xlsx válida e sem senha.',
    );
  }
  const recognized = [
    'Config',
    'Lançamentos',
    'Recorrentes',
    'Parcelamentos',
    'Receitas',
    'Vale Alimentação',
    'Histórico 2026',
    'Faturas',
  ];
  z.array(z.string())
    .refine((names) => names.some((name) => recognized.includes(name)), {
      message: 'Formato não reconhecido. Use a planilha modelo de finanças.',
    })
    .parse(workbook.worksheets.map((sheet) => sheet.name));
  const preview: WorkbookPreview = { items: [], warnings: [], errors: [], controls: null };
  const references = new Map<string, string>();
  const keys = new Set<string>();
  const existingKeys = new Set(
    existing
      .map((record) => (record as unknown as { import_key: string }).import_key)
      .filter(Boolean),
  );
  for (const record of existing) {
    if (['people', 'cards', 'categories'].includes(record.kind)) {
      references.set(`${record.kind}:${record.data.name}`, record.id);
    }
  }
  function add(kind: ResourceKind, input: FinanceData, source: string, identity: string) {
    const data = parseRecordData(kind, input);
    const key = createHash('sha256').update(`${kind}:${identity}`).digest('hex');
    const existingInvoice =
      kind === 'invoices' &&
      existing.some(
        (record) =>
          record.kind === 'invoices' &&
          record.data.month === data.month &&
          record.data.cardId === data.cardId,
      );
    const duplicate = keys.has(key) || existingKeys.has(key) || existingInvoice;
    keys.add(key);
    const item = { id: randomUUID(), kind, data, source, key, duplicate };
    preview.items.push(item);
    return item.id;
  }
  function reference(kind: 'people' | 'categories' | 'cards', name: string, source: string) {
    let id: string | undefined;
    if (name && name !== 'Sem cartão') {
      const key = `${kind}:${name}`;
      id = references.get(key);
      if (!id) {
        id = add(
          kind,
          kind === 'people' ? { name, isSelf: name.toLowerCase() === 'eu' } : { name },
          source,
          name,
        );
        references.set(key, id);
      }
    }
    return id;
  }
  function rows(name: string, start: number, callback: (row: ExcelJS.Row, number: number) => void) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) {
      if (sheet.rowCount <= 20000) {
        sheet.eachRow((row, number) => {
          if (number >= start) {
            try {
              callback(row, number);
            } catch (error) {
              preview.errors.push(
                `${name}, linha ${number}: ${error instanceof Error ? error.message : 'Dados inválidos'}`,
              );
            }
          }
        });
      } else {
        preview.errors.push(`${name}: limite de 20.000 linhas excedido.`);
      }
    }
  }
  rows('Config', 4, (row, number) => {
    const source = `Config:${number}`;
    const name = text(cellValue(row, 1));
    if (name && name !== 'Sem cartão' && number <= 7) {
      const key = `cards:${name}`;
      if (!references.has(key)) {
        const data: FinanceData = { name };
        if (typeof cellValue(row, 2) === 'number') {
          data.limit = cents(cellValue(row, 2));
        }
        if (typeof cellValue(row, 3) === 'number') {
          data.closingDay = Number(cellValue(row, 3));
        }
        if (typeof cellValue(row, 4) === 'number') {
          data.dueDay = Number(cellValue(row, 4));
        }
        references.set(key, add('cards', data, source, name));
      }
    }
    reference('people', text(cellValue(row, 9)), source);
    reference('categories', text(cellValue(row, 10)), source);
  });
  const sourceKinds = {
    Recorrentes: 'recurring',
    Parcelamentos: 'installments',
    Receitas: 'income',
    Lançamentos: 'transactions',
  } as const;
  for (const name of Object.keys(sourceKinds) as (keyof typeof sourceKinds)[]) {
    rows(name, 5, (row, number) => {
      const originalId = text(cellValue(row, 1));
      const description = text(cellValue(row, name === 'Lançamentos' ? 5 : 3));
      if (originalId && !description) {
        preview.warnings.push(`${name}, linha ${number}: linha com apenas identificador ignorada.`);
      }
      if (originalId && description) {
        const source = `${name}:${number}`;
        const kind: ResourceKind = sourceKinds[name];
        const get = (column: number) => cellValue(row, column);
        const data: FinanceData = {
          description,
          amount: cents(
            get(
              name === 'Lançamentos'
                ? 9
                : name === 'Receitas'
                  ? 4
                  : name === 'Parcelamentos'
                    ? 5
                    : 6,
            ),
          ),
          nature:
            name === 'Receitas'
              ? 'income'
              : name === 'Parcelamentos'
                ? 'expense'
                : natureOf(get(name === 'Lançamentos' ? 7 : 5)),
          status: name === 'Lançamentos' ? statusOf(get(10)) : 'planned',
          note: name === 'Lançamentos' ? text(get(11)) : name === 'Receitas' ? text(get(2)) : '',
        };
        if (name !== 'Receitas') {
          data.personId = reference('people', text(get(name === 'Lançamentos' ? 4 : 2)), source);
          data.categoryId = reference(
            'categories',
            text(get(name === 'Lançamentos' ? 6 : 4)),
            source,
          );
          data.cardId = reference(
            'cards',
            text(get(name === 'Lançamentos' ? 8 : name === 'Parcelamentos' ? 6 : 7)),
            source,
          );
        }
        if (name === 'Lançamentos') {
          data.month = isoDate(get(3)).slice(0, 7);
          data.date = get(2) ? isoDate(get(2)) : `${data.month}-01`;
        } else {
          data.startMonth = isoDate(
            get(name === 'Receitas' ? 5 : name === 'Parcelamentos' ? 7 : 8),
          ).slice(0, 7);
          data.active =
            text(get(name === 'Receitas' ? 7 : name === 'Parcelamentos' ? 12 : 10)) === 'Sim';
          if (name === 'Parcelamentos') {
            data.count = Number(get(8));
          } else {
            const end = get(name === 'Receitas' ? 6 : 9);
            if (end) {
              data.endMonth = isoDate(end).slice(0, 7);
            }
          }
        }
        add(kind, data, source, originalId);
      }
    });
  }
  rows('Vale Alimentação', 5, (row, number) => {
    const source = `Vale Alimentação:${number}`;
    if (cellValue(row, 1)) {
      const month = isoDate(cellValue(row, 2)).slice(0, 7);
      add(
        'benefits',
        {
          month,
          date: cellValue(row, 3) ? isoDate(cellValue(row, 3)) : `${month}-01`,
          description: text(cellValue(row, 4)),
          nature: 'expense',
          amount: cents(cellValue(row, 6)),
          note: text(cellValue(row, 7)),
        },
        source,
        text(cellValue(row, 1)),
      );
    }
    if (cellValue(row, 10) && typeof cellValue(row, 11) === 'number') {
      const month = isoDate(cellValue(row, 10)).slice(0, 7);
      add(
        'benefits',
        {
          month,
          date: `${month}-01`,
          description: 'Crédito vale-alimentação',
          nature: 'income',
          amount: cents(cellValue(row, 11)),
          note: '',
        },
        source,
        `credit:${month}`,
      );
    }
  });
  rows('Histórico 2026', 5, (row, number) => {
    if (cellValue(row, 5)) {
      const source = `Histórico 2026:${number}`;
      const originalType = text(cellValue(row, 7));
      const data: FinanceData = {
        month: isoDate(cellValue(row, 1)).slice(0, 7),
        description: text(cellValue(row, 5)),
        amount: cents(cellValue(row, 6)),
        nature: natureOf(originalType),
        originalSheet: text(cellValue(row, 2)),
        originalType,
        originalStatus: text(cellValue(row, 9)),
        status: /realizado/i.test(text(cellValue(row, 3))) ? 'paid' : statusOf(cellValue(row, 9)),
        personId: reference('people', text(cellValue(row, 4)), source),
        cardId: reference('cards', text(cellValue(row, 8)), source),
        categoryId: reference('categories', text(cellValue(row, 10)), source),
        note: text(cellValue(row, 3)),
      };
      add('history', data, source, `${data.month}:${number}`);
    }
  });
  rows('Faturas', 5, (row, number) => {
    if (cellValue(row, 1) && typeof cellValue(row, 7) === 'number') {
      const month = isoDate(cellValue(row, 1)).slice(0, 7);
      const cardId = reference('cards', text(cellValue(row, 2)), `Faturas:${number}`);
      add(
        'invoices',
        { month, cardId, reportedTotal: cents(cellValue(row, 7)), note: '' },
        `Faturas:${number}`,
        `${month}:${text(cellValue(row, 2))}`,
      );
    }
  });
  const dashboard = workbook.getWorksheet('Dashboard');
  if (dashboard) {
    try {
      const value = (cell: string) =>
        cellValue(
          dashboard.getRow(Number(dashboard.getCell(cell).row)),
          Number(dashboard.getCell(cell).col),
        );
      preview.controls = {
        month: isoDate(value('B3')).slice(0, 7),
        income: cents(value('A6')),
        expenses: cents(value('A10')) + cents(value('D10')) + cents(value('G10')),
        investments: cents(value('J10')),
        freeBalance: cents(value('J6')),
        benefitCredit: 0,
        benefitSpent: 0,
      };
      const benefits = workbook.getWorksheet('Vale Alimentação');
      if (benefits) {
        preview.controls.benefitCredit = cents(cellValue(benefits.getRow(3), 5));
        preview.controls.benefitSpent = cents(cellValue(benefits.getRow(3), 7));
      }
    } catch {
      preview.warnings.push('Não foi possível obter todos os totais de conferência do painel.');
    }
  }
  preview.warnings.push(
    'Datas não preenchidas usam o primeiro dia da competência. Os valores negativos foram preservados.',
  );
  preview.warnings.push(
    'O histórico é preservado para consulta e só compõe o painel de meses sem lançamentos ou previsões ativos, evitando dupla contagem.',
  );
  preview.warnings.push(
    'Contas bancárias e seus saldos devem ser cadastrados separadamente; “Sem cartão” não identifica uma conta bancária.',
  );
  return preview;
}
