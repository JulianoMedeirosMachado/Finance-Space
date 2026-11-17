import { z } from 'zod';

export const currencySchema = z.enum(['BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF']);
export type Currency = z.infer<typeof currencySchema>;
