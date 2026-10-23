import 'dotenv/config';
import { z } from 'zod';

async function setupWebhook() {
  const token = z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]+$/)
    .parse(process.env.TELEGRAM_BOT_TOKEN);
  const secret = z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,256}$/)
    .parse(process.env.TELEGRAM_WEBHOOK_SECRET);
  const origin = z.url().parse(process.env.APP_ORIGIN);
  if (origin.startsWith('https://') && new URL(origin).pathname === '/') {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: new URL('/api/integrations/telegram/webhook', origin).toString(),
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        max_connections: 2,
        drop_pending_updates: false,
      }),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    const body = (await response.json()) as { ok?: boolean };
    if (response.ok && body.ok) {
      console.log('Telegram webhook registered. Pending updates were preserved.');
    } else {
      throw new Error('Telegram rejected webhook registration. Check the configuration.');
    }
  } else {
    throw new Error('APP_ORIGIN must be a single HTTPS origin.');
  }
}

void setupWebhook().catch(() => {
  console.error(
    'Webhook setup failed. Check APP_ORIGIN, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET. No secret values are logged.',
  );
  process.exitCode = 1;
});
