import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';

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
      })
      .strict()
      .parse(body);
    const result = await this.auth.register(input.name, input.email, input.password);
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
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies.finance_session || '');
    response.clearCookie('finance_session', { path: '/' });
    return { success: true };
  }
  @Post('forgot-password')
  forgotPassword(@Body() body: unknown) {
    return this.auth.requestReset(z.object({ email: emailSchema }).strict().parse(body).email);
  }
  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
      .strict()
      .parse(body);
    return this.auth.resetPassword(input.token, input.password);
  }
}
