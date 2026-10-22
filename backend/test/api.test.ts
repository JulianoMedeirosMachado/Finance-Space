import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import ExcelJS from 'exceljs';

test(
  'HTTP workflow enforces authentication, ownership, CSRF and optimistic locking and imports atomically',
  { timeout: 45000 },
  async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const directory = await mkdtemp(join(tmpdir(), 'finance-space-api-'));
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [resolve('dist/main.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIRECTORY: directory,
        APP_ORIGIN: origin,
        DATABASE_URL: '',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`API startup timed out: ${output}`)),
          20000,
        );
        child.stdout.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('Nest application successfully started')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.stderr.on('data', (chunk) => {
          output += String(chunk);
        });
        child.once('exit', () => {
          clearTimeout(timeout);
          reject(new Error(output));
        });
      });
      const request = async (
        path: string,
        method = 'GET',
        data?: unknown,
        cookie = '',
        requestOrigin = origin,
      ) =>
        fetch(`${origin}/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Cookie: cookie },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
      assert.equal((await request('/finance/records')).status, 401);
      const signup = await request('/auth/register', 'POST', {
        name: 'Test User',
        email: 'test@example.test',
        password: 'test-password-123',
      });
      assert.equal(signup.status, 201);
      const cookie = signup.headers.get('set-cookie')!.split(';')[0];
      assert.match(signup.headers.get('set-cookie')!, /HttpOnly/);
      assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 200);
      assert.equal(
        (
          await request(
            '/finance/records/accounts',
            'POST',
            { name: 'Bad Origin' },
            cookie,
            'https://evil.example',
          )
        ).status,
        403,
      );
      const accountInput = { name: 'Account', openingBalance: 100000, openingMonth: '2026-10' };
      const creation = await request('/finance/records/accounts', 'POST', accountInput, cookie);
      assert.equal(creation.status, 201);
      const account = (await creation.json()) as { id: string; version: number };
      const update = { data: { ...accountInput, name: 'Updated' }, version: account.version };
      assert.equal(
        (await request(`/finance/records/accounts/${account.id}`, 'PUT', update, cookie)).status,
        200,
      );
      assert.equal(
        (await request(`/finance/records/accounts/${account.id}`, 'PUT', update, cookie)).status,
        409,
      );
      const second = await request('/auth/register', 'POST', {
        name: 'Other User',
        email: 'other@example.test',
        password: 'test-password-123',
      });
      const secondCookie = second.headers.get('set-cookie')!.split(';')[0];
      assert.equal(
        (
          await request(
            '/finance/records/cards',
            'POST',
            { name: 'Wrong owner', accountId: account.id },
            secondCookie,
          )
        ).status,
        400,
      );
      assert.deepEqual(
        await (await request('/finance/records', 'GET', undefined, secondCookie)).json(),
        [],
      );
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Receitas').getRow(5).values = [
        'SAL-001',
        'Work',
        'Salary',
        2500,
        new Date('2026-10-01'),
        undefined,
        'Sim',
      ];
      const bytes = await workbook.xlsx.writeBuffer();
      const upload = new FormData();
      upload.append('file', new Blob([bytes as unknown as ArrayBuffer]), 'finance.xlsx');
      const previewResponse = await fetch(`${origin}/api/imports/preview`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin },
        body: upload,
      });
      assert.equal(previewResponse.status, 201);
      const preview = (await previewResponse.json()) as { id: string; errors: unknown[] };
      assert.deepEqual(preview.errors, []);
      assert.equal(
        (await request('/imports/confirm', 'POST', { id: preview.id, excluded: [] }, secondCookie))
          .status,
        404,
      );
      assert.equal(
        (await request('/imports/confirm', 'POST', { id: preview.id, excluded: [] }, cookie))
          .status,
        201,
      );
      assert.equal(
        (
          (await (
            await request('/finance/dashboard?month=2026-10', 'GET', undefined, cookie)
          ).json()) as { income: number }
        ).income,
        250000,
      );
      const exportResponse = await request('/finance/export', 'GET', undefined, cookie);
      assert.equal(exportResponse.status, 200);
      assert.match(exportResponse.headers.get('content-disposition')!, /attachment/);
      assert.equal((await request('/auth/logout', 'POST', {}, cookie)).status, 201);
      assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
      assert.equal((await fetch(origin + '/login')).status, 200);
    } finally {
      const closed = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill();
      await closed;
      await rm(directory, { recursive: true });
    }
  },
);
