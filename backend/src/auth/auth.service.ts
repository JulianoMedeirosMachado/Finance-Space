import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import type { Language } from '../common/language';

const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  async register(name: string, email: string, password: string, language: Language = 'pt-BR') {
    const id = randomUUID();
    const passwordHash = await this.hashPassword(password);
    await this.database.query(
      'INSERT INTO users(id,email,name,password_hash,language) VALUES($1,$2,$3,$4,$5)',
      [id, email, name, passwordHash, language],
    );
    return this.createSession({ id, email, name, language });
  }

  async login(email: string, password: string) {
    const users = await this.database.query(
      'SELECT id,email,name,password_hash,language FROM users WHERE email=$1',
      [email],
    );
    const user = users[0];
    const stored = user ? String(user.password_hash) : `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const [salt, expected] = stored.split(':');
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    let result;
    if (user && timingSafeEqual(Buffer.from(expected, 'hex'), actual)) {
      result = await this.createSession({
        id: String(user.id),
        email: String(user.email),
        name: String(user.name),
        language: String(user.language),
      });
    } else {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    return result;
  }

  private async createSession(user: { id: string; email: string; name: string; language: string }) {
    const token = randomBytes(32).toString('hex');
    await this.database.query('DELETE FROM sessions WHERE expires_at < NOW()');
    await this.database.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",
      [hashToken(token), user.id],
    );
    return { user, token };
  }

  async findUser(token: string | undefined) {
    const users = await this.database.query(
      'SELECT u.id,u.email,u.name,u.language FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',
      [hashToken(token || '')],
    );
    let user: { id: string; name: string; email: string; language: string };
    if (users[0]) {
      user = users[0] as typeof user;
    } else {
      throw new UnauthorizedException('Entre na sua conta para continuar.');
    }
    return user;
  }

  async updateLanguage(token: string | undefined, language: 'pt-BR' | 'en-US') {
    const user = await this.findUser(token);
    await this.database.query('UPDATE users SET language=$1 WHERE id=$2', [language, user.id]);
    return { ...user, language };
  }

  async logout(token: string) {
    await this.database.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  }

  async requestReset(email: string) {
    if (process.env.SMTP_HOST && process.env.SMTP_FROM) {
      const users = await this.database.query('SELECT id,language FROM users WHERE email=$1', [
        email,
      ]);
      if (users[0]) {
        const token = randomBytes(32).toString('hex');
        await this.database.query(
          'DELETE FROM password_resets WHERE user_id=$1 OR expires_at<NOW()',
          [users[0].id],
        );
        await this.database.query(
          "INSERT INTO password_resets VALUES($1,$2,NOW()+INTERVAL '30 minutes')",
          [hashToken(token), users[0].id],
        );
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_PORT === '465',
          requireTLS: process.env.NODE_ENV === 'production',
          disableFileAccess: true,
          disableUrlAccess: true,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
        });
        const origin = z.url().parse(process.env.APP_ORIGIN?.split(',')[0].trim());
        const resetUrl = new URL('/reset-password', origin);
        resetUrl.searchParams.set('token', token);
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: email,
          subject:
            users[0].language === 'en-US'
              ? 'Password recovery — Finance Space'
              : 'Recuperação de senha — Finance Space',
          text:
            users[0].language === 'en-US'
              ? `Set a new password at ${resetUrl.toString()}\nThis link expires in 30 minutes.`
              : `Defina uma nova senha em ${resetUrl.toString()}\nO link expira em 30 minutos.`,
        });
      }
    } else {
      throw new ServiceUnavailableException('O envio de e-mail ainda não foi configurado.');
    }
    return { message: 'Se o e-mail estiver cadastrado, você receberá as instruções.' };
  }

  async resetPassword(token: string, password: string) {
    const passwordHash = await this.hashPassword(password);
    await this.database.transaction(async (database) => {
      const resets = await database.query(
        'DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>NOW() RETURNING user_id',
        [hashToken(token)],
      );
      if (resets[0]) {
        await database.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
          passwordHash,
          resets[0].user_id,
        ]);
        await database.query('DELETE FROM sessions WHERE user_id=$1', [resets[0].user_id]);
        await database.query('DELETE FROM password_resets WHERE user_id=$1', [resets[0].user_id]);
      } else {
        throw new BadRequestException('Link inválido ou expirado.');
      }
    });
    return { message: 'Senha alterada. Entre novamente.' };
  }
}
