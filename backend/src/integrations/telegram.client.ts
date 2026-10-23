import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { BotReply } from './integration.schema';

@Injectable()
export class TelegramClient {
  available() {
    return Boolean(
      process.env.TELEGRAM_BOT_TOKEN &&
      /^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME || '') &&
      /^[A-Za-z0-9_-]{32,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET || ''),
    );
  }

  async acknowledge(callbackId: string) {
    try {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackId }),
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
    } catch {
      // A callback can expire while a sleeping host starts; the durable operation still runs.
    }
  }

  async send(reply: BotReply) {
    let success = false;
    if (this.available()) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: reply.chatId,
              text: reply.text,
              ...(reply.buttons ? { reply_markup: { inline_keyboard: reply.buttons } } : {}),
            }),
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
          },
        );
        success = response.ok && ((await response.json()) as { ok?: boolean }).ok === true;
      } catch {
        success = false;
      }
    } else {
      throw new ServiceUnavailableException('Integrações não configuradas no servidor.');
    }
    if (!success) {
      throw new ServiceUnavailableException('Não foi possível responder no Telegram.');
    }
  }
}
