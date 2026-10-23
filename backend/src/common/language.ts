import type { Request } from 'express';

export type Language = 'pt-BR' | 'en-US';
export function requestLanguage(request: Request): Language {
  return request.headers['accept-language']?.split(',')[0].trim().toLowerCase().startsWith('en')
    ? 'en-US'
    : 'pt-BR';
}

const english: Record<string, string> = {
  'Não foi possível concluir a operação.': 'Unable to complete the operation.',
  'E-mail ou senha inválidos.': 'Invalid email or password.',
  'Entre na sua conta para continuar.': 'Sign in to continue.',
  'O envio de e-mail ainda não foi configurado.': 'Email delivery has not been configured yet.',
  'Se o e-mail estiver cadastrado, você receberá as instruções.':
    'If the email is registered, you will receive instructions.',
  'Link inválido ou expirado.': 'Invalid or expired link.',
  'Senha alterada. Entre novamente.': 'Password changed. Sign in again.',
  'O término deve ser posterior ao início.': 'The end must be on or after the start.',
  'Selecione contas distintas para a transferência.': 'Select different accounts for the transfer.',
  'Informe a conta e o cartão do pagamento.': 'Select the payment account and card.',
  'Transferências e pagamentos de fatura devem ter valor positivo.':
    'Transfers and statement payments must have a positive amount.',
  'Esta natureza não aceita cartão de crédito.':
    'This transaction type does not support a credit card.',
  'Informe uma conta ou cartão para registrar a realização.':
    'Select an account or card to post the entry.',
  'Receitas recorrentes devem ter natureza de receita.':
    'Recurring income must use the income transaction type.',
  'Informe a conta do acerto realizado.': 'Select the account for the posted settlement.',
  'Selecione registros válidos da sua conta.': 'Select valid records from your account.',
  'O registro foi alterado ou removido. Atualize a página.':
    'The record was changed or removed. Refresh the page.',
  'Já existe um registro para esta origem e competência.':
    'A record already exists for this source and reporting month.',
  'Registro não encontrado.': 'Record not found.',
  'Há registros vinculados. Remova os vínculos ou desative este cadastro.':
    'Linked records exist. Remove the links or deactivate this record.',
  'Previsão não encontrada ou já realizada.': 'Forecast not found or already posted.',
  'O recurso solicitado não foi encontrado.': 'The requested resource was not found.',
  'Os dados enviados excedem o tamanho permitido.': 'The submitted data exceeds the size limit.',
  'Confira os dados enviados e tente novamente.': 'Check the submitted data and try again.',
  'Este registro já existe.': 'This record already exists.',
  'Muitas solicitações. Aguarde um minuto.': 'Too many requests. Wait one minute.',
  'Muitas tentativas. Aguarde 15 minutos.': 'Too many attempts. Wait 15 minutes.',
  'Origem da solicitação não permitida.': 'Request origin is not allowed.',
};

export function translateMessage(message: string, language: Language): string {
  return language === 'en-US' ? english[message] || 'Unable to complete the operation.' : message;
}
