import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readWorkbook } from '../src/imports/workbook-reader';
import { summarize } from '../src/finance/calculations';

test('spreadsheet import preserves negative contributions, parses dates and ignores calculated views', async () => {
  const workbook = new ExcelJS.Workbook();
  const config = workbook.addWorksheet('Config');
  config.getRow(4).values = [
    'Card',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    'Eu',
    'Home',
  ];
  const schedule = workbook.addWorksheet('Recorrentes');
  schedule.getRow(5).values = [
    'REC-001',
    'Eu',
    'Subscription',
    'Home',
    'Despesa',
    19.99,
    'Card',
    new Date('2026-10-01'),
    undefined,
    'Sim',
  ];
  schedule.getRow(6).values = ['REC-002'];
  workbook.addWorksheet('Parcelamentos').getRow(5).values = [
    'PAR-001',
    'Eu',
    'Purchase',
    'Home',
    10,
    'Card',
    new Date('2026-10-01'),
    3,
    undefined,
    undefined,
    undefined,
    'Sim',
  ];
  const transactions = workbook.addWorksheet('Lançamentos');
  transactions.getRow(5).values = [
    'TX-001',
    undefined,
    new Date('2026-10-01'),
    'Other',
    'Contribution',
    'Home',
    'Despesa',
    'Sem cartão',
    -10,
    'Previsto',
    '',
  ];
  workbook.addWorksheet('Mês').getRow(5).values = ['Eu', 'Subscription', 'Home', 'Despesa', 19.99];
  const result = await readWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), []);
  assert.deepEqual(result.errors, []);
  const records = result.items.map((item) => ({ ...item, version: 1 }));
  const summary = summarize(records, '2026-10');
  assert.equal(summary.entries.length, 3);
  assert.equal(summary.expenses, 1999);
  assert.equal(result.items.find((item) => item.kind === 'transactions')?.data.amount, -1000);
});

test('reimport recognizes the stable source IDs', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Receitas').getRow(5).values = [
    'SAL-001',
    'Work',
    'Salary',
    1000,
    new Date('2026-10-01'),
    undefined,
    'Sim',
  ];
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const first = await readWorkbook(buffer, []);
  const existing = first.items.map((item) => ({ ...item, version: 1, import_key: item.key }));
  const repeated = await readWorkbook(buffer, existing);
  assert.equal(repeated.items.filter((item) => !item.duplicate).length, 0);
});
