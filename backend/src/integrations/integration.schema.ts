import { z } from 'zod';

export const aiSettingsSchema = z
  .object({
    provider: z.enum(['deepseek', 'openrouter']),
    model: z
      .string()
      .trim()
      .min(1)
      .max(150)
      .regex(/^[a-zA-Z0-9_.:/-]+$/),
    apiKey: z
      .string()
      .trim()
      .min(8)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    consent: z.literal(true),
  })
  .strict();
export type AiSettings = z.infer<typeof aiSettingsSchema>;

const actor = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  is_bot: z.boolean().optional(),
  first_name: z.string().max(100).optional(),
});
const message = z.object({
  message_id: z.number().int(),
  from: actor.optional(),
  chat: z.object({
    id: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    type: z.string().max(30),
  }),
  text: z.string().max(4096).optional(),
});
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: message.optional(),
  callback_query: z
    .object({
      id: z.string().max(150),
      from: actor,
      message: message.optional(),
      data: z.string().max(64).optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export interface BotReply {
  chatId: string;
  ownerId?: string;
  text: string;
  buttons?: { text: string; callback_data: string }[][];
}

export const expenseProposalSchema = z
  .object({
    description: z.string().trim().min(1).max(250),
    amount: z.number().int().positive().max(100_000_000_000),
    date: z.iso.date(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    accountId: z.uuid().nullable(),
    cardId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    personId: z.uuid().nullable().default(null),
    personMentioned: z.boolean().default(false),
    clarification: z.string().max(400).nullable(),
    installments: z.number().int().min(1).max(600).default(1),
    amountBasis: z.enum(['total', 'per_installment']).default('total'),
  })
  .strict();
export type ExpenseProposal = z.infer<typeof expenseProposalSchema>;
