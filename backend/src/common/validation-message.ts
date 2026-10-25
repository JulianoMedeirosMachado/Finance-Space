import type { ZodError } from 'zod';
import { translateMessage, type Language } from './language';

const englishFields: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  password: 'Password',
  token: 'Recovery code',
  description: 'Description',
  amount: 'Amount',
  balance: 'Actual balance',
  expectedBalance: 'Calculated balance',
  targetAmount: 'Target amount',
  monthlyAmount: 'Monthly contribution',
  deadline: 'Deadline',
  date: 'Date',
  month: 'Reporting month',
  startMonth: 'First reporting month',
  endMonth: 'Last reporting month',
  openingMonth: 'Opening balance month',
  openingBalance: 'Opening balance',
  reportedTotal: 'Reported total',
  limit: 'Limit',
  closingDay: 'Closing day',
  dueDay: 'Due day',
  day: 'Planned day',
  count: 'Number of installments',
  note: 'Note',
  accountId: 'Bank account',
  destinationAccountId: 'Destination account',
  cardId: 'Card',
  personId: 'Person',
  categoryId: 'Category',
  goalId: 'Goal',
  nature: 'Transaction type',
  status: 'Status',
  type: 'Type',
  active: 'Active',
  isSelf: 'This person is me',
  language: 'Language',
};

const fieldLabels: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  token: 'Código de recuperação',
  description: 'Descrição',
  amount: 'Valor',
  balance: 'Saldo real',
  expectedBalance: 'Saldo calculado',
  targetAmount: 'Valor da meta',
  monthlyAmount: 'Aporte mensal',
  deadline: 'Prazo',
  date: 'Data',
  month: 'Competência',
  startMonth: 'Primeira competência',
  endMonth: 'Última competência',
  openingMonth: 'Competência do saldo inicial',
  openingBalance: 'Saldo inicial',
  reportedTotal: 'Total informado',
  limit: 'Limite',
  closingDay: 'Dia de fechamento',
  dueDay: 'Dia de vencimento',
  day: 'Dia previsto',
  count: 'Quantidade de parcelas',
  note: 'Observação',
  accountId: 'Conta bancária',
  destinationAccountId: 'Conta de destino',
  cardId: 'Cartão',
  personId: 'Responsável',
  categoryId: 'Categoria',
  goalId: 'Meta',
  nature: 'Natureza',
  status: 'Situação',
  type: 'Tipo',
  active: 'Ativo',
  isSelf: 'Esta pessoa sou eu',
  language: 'Idioma',
};

export function validationMessage(error: ZodError, language: Language = 'pt-BR'): string {
  const english = language === 'en-US';
  const messages = error.issues.map((issue) => {
    const field =
      (english ? englishFields : fieldLabels)[String(issue.path.at(-1))] ||
      (english ? 'Field' : 'Campo');
    let message = english
      ? `${field}: check the entered value.`
      : `${field}: confira o valor informado.`;
    if (issue.code === 'custom') {
      message = translateMessage(issue.message, language);
    } else if (issue.code === 'invalid_type') {
      message = english ? `${field}: enter a valid value.` : `${field}: informe um valor válido.`;
    } else if (issue.code === 'invalid_value') {
      message = english
        ? `${field}: select a valid option.`
        : `${field}: selecione uma opção válida.`;
    } else if (issue.code === 'invalid_format') {
      message = english
        ? `${field}: enter a valid format.`
        : `${field}: informe um formato válido.`;
    } else if (issue.code === 'too_small' || issue.code === 'too_big') {
      const bound = issue.code === 'too_small' ? issue.minimum : issue.maximum;
      const comparison =
        issue.code === 'too_small'
          ? issue.inclusive
            ? 'no mínimo'
            : 'mais de'
          : issue.inclusive
            ? 'no máximo'
            : 'menos de';
      const unit = issue.origin === 'string' ? ' caracteres' : '';
      message = `${field}: informe ${comparison} ${bound}${unit}.`;
      if (english) {
        const comparison =
          issue.code === 'too_small'
            ? issue.inclusive
              ? 'at least'
              : 'more than'
            : issue.inclusive
              ? 'at most'
              : 'less than';
        message = `${field}: enter ${comparison} ${bound}${issue.origin === 'string' ? ' characters' : ''}.`;
      }
    } else if (issue.code === 'unrecognized_keys') {
      message = english
        ? 'The form contains fields that are not allowed.'
        : 'O formulário contém campos não permitidos.';
    }
    return message;
  });
  return [...new Set(messages)].join(' ');
}
