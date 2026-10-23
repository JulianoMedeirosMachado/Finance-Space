import 'reflect-metadata';
import 'dotenv/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DatabaseService } from './database/database.service';

export function encryptBackup(content: string, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv);
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  return JSON.stringify({
    format: 'finance-space-encrypted',
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    content: encrypted.toString('base64'),
  });
}
export function decryptBackup(content: string, password: string) {
  const input = z
    .object({
      format: z.literal('finance-space-encrypted'),
      version: z.literal(1),
      salt: z.string().regex(/^[a-f0-9]{32}$/),
      iv: z.string().regex(/^[a-f0-9]{24}$/),
      tag: z.string().regex(/^[a-f0-9]{32}$/),
      content: z.string(),
    })
    .parse(JSON.parse(content));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    scryptSync(password, Buffer.from(input.salt, 'hex'), 32),
    Buffer.from(input.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(input.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(input.content, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function run() {
  const password = z
    .string()
    .min(16, 'Set BACKUP_PASSWORD with at least 16 characters.')
    .parse(process.env.BACKUP_PASSWORD);
  const database = new DatabaseService();
  await database.onModuleInit();
  try {
    if (process.argv[2] === 'restore') {
      const filename = z.string().min(1).parse(process.argv[3]);
      const decoded = decryptBackup(await readFile(resolve(filename), 'utf8'), password);
      const backup = z
        .object({
          format: z.literal('finance-space-backup'),
          version: z.literal(1),
          users: z.array(z.record(z.string(), z.unknown())),
          records: z.array(z.record(z.string(), z.unknown())),
          imports: z.array(z.record(z.string(), z.unknown())),
        })
        .parse(JSON.parse(decoded));
      await database.transaction(async (transaction) => {
        const count = await transaction.query('SELECT COUNT(*) AS count FROM users');
        if (Number(count[0].count) === 0) {
          for (const user of backup.users) {
            await transaction.query(
              'INSERT INTO users(id,email,name,password_hash,created_at,language) VALUES($1,$2,$3,$4,$5,$6)',
              [
                user.id,
                user.email,
                user.name,
                user.password_hash,
                user.created_at,
                z.enum(['pt-BR', 'en-US']).parse(user.language ?? 'pt-BR'),
              ],
            );
          }
          for (const record of backup.records) {
            await transaction.query(
              'INSERT INTO records(id,user_id,kind,data,import_key,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
              [
                record.id,
                record.user_id,
                record.kind,
                JSON.stringify(record.data),
                record.import_key,
                record.version,
                record.created_at,
                record.updated_at,
              ],
            );
          }
          for (const item of backup.imports) {
            await transaction.query(
              'INSERT INTO imports(id,user_id,filename,fingerprint,summary,created_at) VALUES($1,$2,$3,$4,$5,$6)',
              [
                item.id,
                item.user_id,
                item.filename,
                item.fingerprint,
                JSON.stringify(item.summary),
                item.created_at,
              ],
            );
          }
        } else {
          throw new Error(
            'Restore requires an empty database. Existing accounts will never be overwritten.',
          );
        }
      });
      console.log('Backup restored. Users must sign in again.');
    } else {
      const backup = await database.transaction(async (transaction) => ({
        format: 'finance-space-backup',
        version: 1,
        users: await transaction.query('SELECT * FROM users ORDER BY id'),
        records: await transaction.query('SELECT * FROM records ORDER BY id'),
        imports: await transaction.query('SELECT * FROM imports ORDER BY id'),
      }));
      const directory = resolve('../backups');
      await mkdir(directory, { recursive: true });
      const filename = resolve(
        directory,
        `finance-space-${new Date().toISOString().replace(/[:.]/g, '-')}.fsbackup`,
      );
      await writeFile(filename, encryptBackup(JSON.stringify(backup), password), {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(`Encrypted backup saved: ${filename}`);
    }
  } finally {
    await database.onModuleDestroy();
  }
}
if (require.main === module) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Backup failed.');
    process.exitCode = 1;
  });
}
