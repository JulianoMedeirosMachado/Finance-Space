import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validationMessage } from '../src/common/validation-message';

test('validation messages use Portuguese labels without exposing internal enum values or keys', () => {
  const result = z
    .object({
      email: z.string().email(),
      nature: z.enum(['expense', 'income']),
      password: z.string().min(10),
    })
    .strict()
    .safeParse({ email: 'invalid', nature: 'other', password: 'short', userId: 'private' });
  assert.equal(result.success, false);
  if (!result.success) {
    const message = validationMessage(result.error);
    assert.match(message, /E-mail: informe um formato válido/);
    assert.match(message, /Natureza: selecione uma opção válida/);
    assert.match(message, /Senha: informe no mínimo 10 caracteres/);
    assert.match(message, /campos não permitidos/);
    assert.doesNotMatch(message, /expense|income|userId|private|Invalid|Too small/);
  }
});

test('validation messages preserve domain rules and distinguish inclusive and exclusive limits', () => {
  const result = z
    .object({
      amount: z.number().positive(),
      note: z.string().max(3),
    })
    .refine(() => false, { message: 'Confira o valor da meta.' })
    .safeParse({ amount: 0, note: 'long' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      validationMessage(result.error),
      'Valor: informe mais de 0. Observação: informe no máximo 3 caracteres. Confira o valor da meta.',
    );
  }
});
