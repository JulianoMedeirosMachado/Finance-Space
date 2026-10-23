import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { IntegrationService } from './integration.service';
import { TelegramWorker } from './telegram.worker';
import { aiSettingsSchema } from './integration.schema';

@Controller('integrations')
export class IntegrationController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(IntegrationService) private readonly integration: IntegrationService,
    @Inject(TelegramWorker) private readonly worker: TelegramWorker,
  ) {}

  @Get()
  async status(@Req() request: Request) {
    return this.integration.status((await this.auth.findUser(request.cookies.finance_session)).id);
  }

  @Put('ai')
  async saveAi(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    return this.integration.saveAi(user.id, aiSettingsSchema.parse(body));
  }

  @Post('ai/test')
  async testAi(@Req() request: Request) {
    return this.integration.testAi((await this.auth.findUser(request.cookies.finance_session)).id);
  }

  @Patch('insights')
  async insightsPreference(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    const input = z.object({ enabled: z.boolean() }).strict().parse(body);
    return this.integration.setInsightsEnabled(user.id, input.enabled);
  }

  @Delete('ai')
  async deleteAi(@Req() request: Request) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    await this.integration.repository.deleteAi(user.id);
    return this.integration.status(user.id);
  }

  @Post('telegram/link')
  async link(@Req() request: Request) {
    return this.integration.startLink(
      (await this.auth.findUser(request.cookies.finance_session)).id,
    );
  }

  @Post('telegram/confirm')
  async confirm(@Req() request: Request, @Body() body: unknown) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    const input = z
      .object({ candidateId: z.string().regex(/^\d{1,16}$/) })
      .strict()
      .parse(body);
    return this.integration.confirmLink(user.id, input.candidateId);
  }

  @Delete('telegram')
  async disconnect(@Req() request: Request) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    await this.integration.repository.disconnect(user.id);
    return this.integration.status(user.id);
  }

  @Post('telegram/webhook')
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
  ) {
    return this.worker.receive(secret, body);
  }
}
