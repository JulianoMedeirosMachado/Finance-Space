import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { ImportService } from './import.service';

@Controller('imports')
export class ImportController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ImportService) private readonly imports: ImportService,
  ) {}
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }),
  )
  async preview(@Req() request: Request, @UploadedFile() file: Express.Multer.File) {
    const user = await this.auth.findUser(request.cookies.finance_session);
    let result;
    if (
      file &&
      /\.xlsx$/i.test(file.originalname) &&
      file.buffer[0] === 0x50 &&
      file.buffer[1] === 0x4b
    ) {
      result = await this.imports.preview(user.id, file.originalname, file.buffer);
    } else {
      throw new BadRequestException('Selecione uma planilha .xlsx válida (até 10 MB).');
    }
    return result;
  }
  @Post('confirm')
  async confirm(@Req() request: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.uuid(), excluded: z.array(z.uuid()).max(20000).default([]) })
      .strict()
      .parse(body);
    return this.imports.confirm(
      (await this.auth.findUser(request.cookies.finance_session)).id,
      input.id,
      input.excluded,
    );
  }
  @Get()
  async history(@Req() request: Request) {
    return this.imports.history((await this.auth.findUser(request.cookies.finance_session)).id);
  }
}
