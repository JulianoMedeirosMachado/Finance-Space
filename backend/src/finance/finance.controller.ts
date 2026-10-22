import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { FinanceService } from './finance.service';
import { kindSchema, monthSchema } from './finance.schema';

@Controller('finance')
export class FinanceController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}
  @Get('records')
  async list(@Req() request: Request) {
    return this.finance.list((await this.auth.findUser(request.cookies.finance_session)).id);
  }
  @Get('dashboard')
  async dashboard(@Req() request: Request, @Query('month') month: string) {
    return this.finance.dashboard(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      monthSchema.parse(month),
    );
  }
  @Post('records/:kind')
  async create(@Req() request: Request, @Param('kind') kind: string, @Body() body: unknown) {
    return this.finance.save(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      kindSchema.parse(kind),
      body,
    );
  }
  @Put('records/:kind/:id')
  async update(
    @Req() request: Request,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({ data: z.unknown(), version: z.number().int().positive() })
      .strict()
      .parse(body);
    return this.finance.save(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      kindSchema.parse(kind),
      input.data,
      z.uuid().parse(id),
      input.version,
    );
  }
  @Delete('records/:id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    return this.finance.remove(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      z.uuid().parse(id),
    );
  }
  @Post('realize')
  async realize(@Req() request: Request, @Body() body: unknown) {
    const input = z
      .object({ month: monthSchema, sourceId: z.uuid(), accountId: z.uuid().optional() })
      .strict()
      .parse(body);
    return this.finance.realize(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      input.month,
      input.sourceId,
      input.accountId,
    );
  }
  @Get('export')
  async export(@Req() request: Request, @Res() response: Response) {
    const records = await this.finance.list(
      (await this.auth.findUser(request.cookies.finance_session)).id,
    );
    response.setHeader('Content-Disposition', 'attachment; filename="finance-space-export.json"');
    response.json({
      format: 'finance-space',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    });
  }
}
