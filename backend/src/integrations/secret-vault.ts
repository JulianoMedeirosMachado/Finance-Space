import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export class SecretVault {
  private key() {
    const encoded = process.env.INTEGRATION_ENCRYPTION_KEY || '';
    const key = Buffer.from(encoded, 'base64');
    let validated: Buffer;
    if (key.length === 32 && key.toString('base64') === encoded) {
      validated = key;
    } else {
      throw new ServiceUnavailableException('Integrações não configuradas no servidor.');
    }
    return validated;
  }

  available() {
    let available = false;
    try {
      this.key();
      available = true;
    } catch {
      available = false;
    }
    return available;
  }

  encrypt(secret: string, userId: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(userId));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString('base64')).join('.');
  }

  decrypt(secret: string, userId: string) {
    const [iv, tag, encrypted] = secret.split('.').map((value) => Buffer.from(value, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
