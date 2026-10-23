import { Body, Controller, Get, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { requestLanguage, translateMessage } from '../common/language';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(10, 'Use pelo menos 10 caracteres.').max(128);

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private setCookie(response: Response, token: string) {
    response.cookie('finance_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 86400000,
      path: '/',
    });
  }
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: emailSchema,
        password: passwordSchema,
        language: z.enum(['pt-BR', 'en-US']).default('pt-BR'),
      })
      .strict()
      .parse(body);
    const result = await this.auth.register(
      input.name,
      input.email,
      input.password,
      input.language,
    );
    this.setCookie(response, result.token);
    return result.user;
  }
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = z
      .object({ email: emailSchema, password: z.string().min(1).max(128) })
      .strict()
      .parse(body);
    const result = await this.auth.login(input.email, input.password);
    this.setCookie(response, result.token);
    return result.user;
  }
  @Get('me')
  me(@Req() request: Request) {
    return this.auth.findUser(request.cookies.finance_session);
  }
  @Patch('preferences')
  updatePreferences(@Body() body: unknown, @Req() request: Request) {
    const input = z
      .object({ language: z.enum(['pt-BR', 'en-US']) })
      .strict()
      .parse(body);
    return this.auth.updateLanguage(request.cookies.finance_session, input.language);
  }
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies.finance_session || '');
    response.clearCookie('finance_session', { path: '/' });
    return { success: true };
  }
  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown, @Req() request: Request) {
    const result = await this.auth.requestReset(
      z.object({ email: emailSchema }).strict().parse(body).email,
    );
    return { message: translateMessage(result.message, requestLanguage(request)) };
  }
  @Post('reset-password')
  async resetPassword(@Body() body: unknown, @Req() request: Request) {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
      .strict()
      .parse(body);
    const result = await this.auth.resetPassword(input.token, input.password);
    return { message: translateMessage(result.message, requestLanguage(request)) };
  }
}
