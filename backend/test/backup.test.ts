import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptBackup, encryptBackup } from '../src/backup';
test('backup encryption restores content and rejects incorrect passwords and tampering', () => {
  const original = JSON.stringify({ records: [{ description: 'Private data', amount: 12345 }] });
  const encrypted = encryptBackup(original, 'long-backup-password');
  assert.equal(encrypted.includes('Private data'), false);
  assert.equal(decryptBackup(encrypted, 'long-backup-password'), original);
  assert.throws(() => decryptBackup(encrypted, 'wrong-password'));
  const tampered = JSON.parse(encrypted);
  tampered.tag = '0'.repeat(32);
  assert.throws(() => decryptBackup(JSON.stringify(tampered), 'long-backup-password'));
});
