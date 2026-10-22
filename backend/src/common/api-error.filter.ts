import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message = 'Não foi possível concluir a operação.';
    if (error instanceof ZodError) {
      status = 400;
      message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if ((error as { code?: string })?.code === '23505') {
      status = 409;
      message = 'Este registro já existe.';
    } else {
      Logger.error(error instanceof Error ? error.stack : 'Unexpected error', 'API');
    }
    response.status(status).json({ message });
  }
}
