import { Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { InsightsService } from './insights.service';
import { insightKindSchema } from './insights.schema';

@Controller('insights')
export class InsightsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InsightsService) private readonly insights: InsightsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    return this.insights.list((await this.auth.findUser(request.cookies.finance_session)).id);
  }

  @Post(':kind')
  async generate(@Req() request: Request, @Param('kind') kind: string) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    return this.insights.generate(
      user.id,
      insightKindSchema.parse(kind),
      user.language === 'en-US' ? 'en-US' : 'pt-BR',
    );
  }
}
