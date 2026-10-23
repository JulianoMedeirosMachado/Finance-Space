import type { TelegramUpdate } from './integration.schema';

export interface TelegramContext {
  actorId: string;
  ownerId: string | null;
  bindingVersion: number | null;
  linkHash: string | null;
}

export function privateTelegramActor(update: TelegramUpdate) {
  const message = update.message || update.callback_query?.message;
  const actor = update.callback_query?.from || update.message?.from;
  let id: string | null = null;
  if (
    message?.chat.type === 'private' &&
    actor &&
    !actor.is_bot &&
    String(message.chat.id) === String(actor.id)
  ) {
    id = String(actor.id);
  }
  return id;
}
