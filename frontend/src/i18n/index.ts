import { ref, watchEffect } from 'vue';
import { english } from './en-US';

export type Language = 'pt-BR' | 'en-US';
export const language = ref<Language>('pt-BR');

export function setLanguage(value: Language) {
  language.value = value;
}

export function t(message: string, parameters: Record<string, string | number> = {}): string {
  const translated = language.value === 'en-US' ? english[message] || message : message;
  return translated.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder,
  );
}

export function initializeLanguage() {
  watchEffect(() => {
    document.documentElement.lang = language.value;
  });
}
