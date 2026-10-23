import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomInt } from 'node:crypto';

test(
  'HTTP workflow enforces authentication, ownership, CSRF, optimistic locking and goal tracking without the retired importer',
  { timeout: 45000 },
  async () => {
    let port = 0;
    for (let attempt = 0; attempt < 20 && port === 0; attempt++) {
      const candidate = randomInt(49152, 65535);
      const server = createServer();
      const available = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(candidate, '127.0.0.1', () => resolve(true));
      });
      if (available) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        port = candidate;
      }
    }
    assert.ok(port > 0, 'No test port is available.');
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
        INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_BOT_USERNAME: '',
        TELEGRAM_WEBHOOK_SECRET: '',
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
        language = 'pt-BR',
      ) =>
        fetch(`${origin}/api${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: requestOrigin,
            Cookie: cookie,
            'Accept-Language': language,
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
      assert.equal((await request('/finance/records')).status, 401);
      assert.equal((await request('/integrations')).status, 401);
      assert.equal((await request('/insights')).status, 401);
      assert.equal((await request('/insights/weekly', 'POST')).status, 401);
      assert.equal(
        (await request('/integrations/insights', 'PATCH', { enabled: true })).status,
        401,
      );
      assert.equal((await request('/integrations/ai', 'PUT', {})).status, 401);
      assert.equal((await request('/integrations/telegram/link', 'POST')).status, 401);
      assert.equal(
        (await request('/integrations/telegram/webhook', 'POST', { update_id: 1 })).status,
        401,
      );
      assert.equal((await request('/finance/export')).status, 401);
      assert.equal((await request('/finance/dashboard?month=2026-10')).status, 401);
      assert.equal(
        (await request('/auth/preferences', 'PATCH', { language: 'en-US' })).status,
        401,
      );
      const englishError = await request(
        '/auth/register',
        'POST',
        { name: 'Test User', email: 'invalid', password: 'short' },
        '',
        origin,
        'en-US',
      );
      assert.equal(englishError.status, 400);
      assert.deepEqual(await englishError.json(), {
        message: 'Email: enter a valid format. Password: enter at least 10 characters.',
      });
      const invalidSignup = await request('/auth/register', 'POST', {
        name: 'Test User',
        email: 'invalid',
        password: 'short',
      });
      assert.equal(invalidSignup.status, 400);
      assert.deepEqual(await invalidSignup.json(), {
        message: 'E-mail: informe um formato válido. Senha: informe no mínimo 10 caracteres.',
      });
      const signup = await request('/auth/register', 'POST', {
        name: 'Test User',
        email: 'test@example.test',
        password: 'test-password-123',
      });
      assert.equal(signup.status, 201);
      const cookie = signup.headers.get('set-cookie')!.split(';')[0];
      const aiKey = randomBytes(24).toString('hex');
      const aiConfig = { provider: 'deepseek', model: 'test-model', apiKey: aiKey, consent: true };
      assert.equal(
        (await request('/integrations/ai', 'PUT', aiConfig, cookie, 'https://evil.example.test'))
          .status,
        403,
      );
      assert.equal(
        (await request('/integrations/ai', 'PUT', { ...aiConfig, consent: false }, cookie)).status,
        400,
      );
      const integrationSaved = await request('/integrations/ai', 'PUT', aiConfig, cookie);
      assert.equal(integrationSaved.status, 200);
      const integrationStatus = await integrationSaved.json();
      assert.equal(integrationStatus.hasKey, true);
      assert.equal(integrationStatus.telegramAvailable, false);
      assert.equal(integrationStatus.insightsEnabled, false);
      assert.equal(
        (
          await request(
            '/integrations/insights',
            'PATCH',
            { enabled: true },
            cookie,
            'https://evil.example.test',
          )
        ).status,
        403,
      );
      assert.equal(
        (await request('/integrations/insights', 'PATCH', { enabled: 'true' }, cookie)).status,
        400,
      );
      assert.equal(
        (await request('/integrations/insights', 'PATCH', { enabled: true }, cookie)).status,
        200,
      );
      assert.equal(
        (await (await request('/insights', 'GET', undefined, cookie)).json()).enabled,
        true,
      );
      assert.equal((await request('/insights/invalid', 'POST', {}, cookie)).status, 400);
      assert.equal(
        (await request('/insights/weekly', 'POST', { retry: 'true' }, cookie)).status,
        400,
      );
      assert.equal(
        (await request('/integrations/insights', 'PATCH', { enabled: false }, cookie)).status,
        200,
      );
      assert.equal((await request('/insights/weekly', 'POST', {}, cookie)).status, 403);
      assert.ok(!JSON.stringify(integrationStatus).includes(aiKey));
      assert.equal((await request('/integrations/telegram/link', 'POST', {}, cookie)).status, 503);
      assert.equal((await request('/integrations/ai', 'DELETE', undefined, cookie)).status, 200);
      assert.equal(
        (await (await request('/integrations', 'GET', undefined, cookie)).json()).hasKey,
        false,
      );
      assert.match(signup.headers.get('set-cookie')!, /HttpOnly/);
      assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 200);
      const preference = await request('/auth/preferences', 'PATCH', { language: 'en-US' }, cookie);
      assert.equal(preference.status, 200);
      assert.equal((await preference.json()).language, 'en-US');
      assert.equal(
        (await (await request('/auth/me', 'GET', undefined, cookie)).json()).language,
        'en-US',
      );
      assert.equal(
        (await request('/auth/preferences', 'PATCH', { language: 'de-DE' }, cookie)).status,
        400,
      );
      assert.equal(
        (
          await request(
            '/auth/preferences',
            'PATCH',
            { language: 'pt-BR', userId: 'forged' },
            cookie,
          )
        ).status,
        400,
      );
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
      assert.equal(creation.headers.get('cache-control'), 'no-store');
      assert.equal(
        (
          await request(
            '/finance/records/accounts',
            'POST',
            { ...accountInput, userId: account.id },
            cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            '/finance/records/accounts',
            'POST',
            { ...accountInput, role: 'admin' },
            cookie,
          )
        ).status,
        400,
      );
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
        (await (await request('/auth/me', 'GET', undefined, secondCookie)).json()).language,
        'pt-BR',
      );
      assert.equal(
        (await (await request('/auth/me', 'GET', undefined, cookie)).json()).language,
        'en-US',
      );
      assert.equal(
        (
          await request(
            `/finance/records/accounts/${account.id}`,
            'PUT',
            { data: accountInput, version: 2 },
            secondCookie,
          )
        ).status,
        409,
      );
      const isolatedDashboard = (await (
        await request('/finance/dashboard?month=2026-10', 'GET', undefined, secondCookie)
      ).json()) as { balances: unknown[] };
      assert.deepEqual(isolatedDashboard.balances, []);
      const isolatedExport = (await (
        await request('/finance/export', 'GET', undefined, secondCookie)
      ).json()) as { records: unknown[] };
      assert.deepEqual(isolatedExport.records, []);
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
      assert.equal((await request('/imports/preview', 'POST', {}, cookie)).status, 404);
      const missingRoute = await request('/imports', 'GET', undefined, cookie);
      assert.equal(missingRoute.status, 404);
      assert.deepEqual(await missingRoute.json(), {
        message: 'O recurso solicitado não foi encontrado.',
      });
      const goalResponse = await request(
        '/finance/records/goals',
        'POST',
        { name: 'GPU', targetAmount: 500000, monthlyAmount: 10000 },
        cookie,
      );
      assert.equal(goalResponse.status, 201);
      const goal = (await goalResponse.json()) as { id: string };
      assert.equal(
        (
          await request(
            '/finance/records/goalContributions',
            'POST',
            { goalId: goal.id, amount: 10000, date: '2026-10-22' },
            secondCookie,
          )
        ).status,
        400,
      );
      const contributionResponse = await request(
        '/finance/records/goalContributions',
        'POST',
        { goalId: goal.id, amount: 10000, date: '2026-10-22' },
        cookie,
      );
      assert.equal(contributionResponse.status, 201);
      const contribution = (await contributionResponse.json()) as { id: string; version: number };
      const dashboard = (await (
        await request('/finance/dashboard?month=2026-10', 'GET', undefined, cookie)
      ).json()) as {
        income: number;
        expenses: number;
        investments: number;
        goals: { savedAmount: number; progress: number; remainingAmount: number }[];
      };
      assert.equal(dashboard.goals[0].savedAmount, 10000);
      assert.equal(dashboard.goals[0].progress, 2);
      assert.equal(dashboard.goals[0].remainingAmount, 490000);
      assert.equal(dashboard.income + dashboard.expenses + dashboard.investments, 0);
      assert.equal(
        (await request(`/finance/records/${goal.id}`, 'DELETE', undefined, cookie)).status,
        409,
      );
      assert.equal(
        (
          await request(
            `/finance/records/goalContributions/${contribution.id}`,
            'PUT',
            {
              data: {
                goalId: goal.id,
                amount: 20000,
                date: '2026-10-22',
                note: 'Updated contribution',
              },
              version: contribution.version,
            },
            cookie,
          )
        ).status,
        200,
      );
      const updatedDashboard = (await (
        await request('/finance/dashboard?month=2026-10', 'GET', undefined, cookie)
      ).json()) as { goals: { savedAmount: number; progress: number }[] };
      assert.equal(updatedDashboard.goals[0].progress, 4);
      assert.equal(
        (await request(`/finance/records/${contribution.id}`, 'DELETE', undefined, secondCookie))
          .status,
        404,
      );
      assert.equal(
        (await request(`/finance/records/${contribution.id}`, 'DELETE', undefined, cookie)).status,
        200,
      );
      const clearedDashboard = (await (
        await request('/finance/dashboard?month=2026-10', 'GET', undefined, cookie)
      ).json()) as { goals: { savedAmount: number }[] };
      assert.equal(clearedDashboard.goals[0].savedAmount, 0);
      const exportResponse = await request('/finance/export', 'GET', undefined, cookie);
      assert.equal(exportResponse.status, 200);
      assert.match(exportResponse.headers.get('content-disposition')!, /attachment/);
      assert.equal((await request('/auth/logout', 'POST', {}, cookie)).status, 201);
      assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
      assert.equal((await fetch(origin + '/login')).status, 200);
      const manifestResponse = await fetch(origin + '/manifest.webmanifest');
      assert.equal(manifestResponse.status, 200);
      assert.match(
        manifestResponse.headers.get('content-type') || '',
        /manifest\+json|application\/json/,
      );
      const manifest = (await manifestResponse.json()) as {
        id: string;
        start_url: string;
        scope: string;
        display: string;
        icons: { src: string }[];
      };
      assert.equal(manifest.id, '/');
      assert.equal(manifest.scope, '/');
      assert.equal(manifest.start_url, '/dashboard');
      assert.equal(manifest.display, 'standalone');
      for (const path of [
        '/dashboard',
        '/login',
        '/month',
        '/transactions',
        '/goals',
        '/settings',
        '/integrations',
        '/insights',
      ]) {
        assert.ok(new URL(path, origin).pathname.startsWith(manifest.scope));
        const page = await fetch(origin + path);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /rel="manifest" href="\/manifest.webmanifest"/);
      }
      const icon = await fetch(new URL(manifest.icons[0].src, origin));
      assert.equal(icon.status, 200);
      assert.match(icon.headers.get('content-type') || '', /image\/png/);
    } finally {
      const closed = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill();
      await closed;
      await rm(directory, { recursive: true });
    }
  },
);
