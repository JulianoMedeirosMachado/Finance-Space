import type { ZodError } from 'zod';

const fieldLabels: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  token: 'Código de recuperação',
  description: 'Descrição',
  amount: 'Valor',
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
};

export function validationMessage(error: ZodError): string {
  const messages = error.issues.map((issue) => {
    const field = fieldLabels[String(issue.path.at(-1))] || 'Campo';
    let message = `${field}: confira o valor informado.`;
    if (issue.code === 'custom') {
      message = issue.message;
    } else if (issue.code === 'invalid_type') {
      message = `${field}: informe um valor válido.`;
    } else if (issue.code === 'invalid_value') {
      message = `${field}: selecione uma opção válida.`;
    } else if (issue.code === 'invalid_format') {
      message = `${field}: informe um formato válido.`;
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
    } else if (issue.code === 'unrecognized_keys') {
      message = 'O formulário contém campos não permitidos.';
    }
    return message;
  });
  return [...new Set(messages)].join(' ');
}
