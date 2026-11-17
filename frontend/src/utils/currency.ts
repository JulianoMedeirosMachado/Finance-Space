import { computed, ref } from 'vue';
import { language } from '../i18n';

export const currencies = ['BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF'] as const;
export type Currency = (typeof currencies)[number];
export const currency = ref<Currency>('BRL');
export const currencySymbol = computed(
  () =>
    new Intl.NumberFormat(language.value, { style: 'currency', currency: currency.value })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency.value,
);

export function setCurrency(value: Currency) {
  currency.value = currencies.includes(value) ? value : 'BRL';
}

export function currencyLabel(label: string) {
  return label.replace(/\((?:R\$|BRL)\)/g, `(${currency.value})`);
}
