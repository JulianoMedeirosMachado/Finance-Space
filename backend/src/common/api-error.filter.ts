import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';
import { validationMessage } from './validation-message';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message = 'Não foi possível concluir a operação.';
    if (error instanceof ZodError) {
      status = 400;
      message = validationMessage(error);
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
      if (status === 404) {
        message = 'O recurso solicitado não foi encontrado.';
      } else if (status === 413) {
        message = 'Os dados enviados excedem o tamanho permitido.';
      } else if (status === 400 && error.message === 'Bad Request') {
        message = 'Confira os dados enviados e tente novamente.';
      }
    } else if ((error as { code?: string })?.code === '23505') {
      status = 409;
      message = 'Este registro já existe.';
    } else {
      Logger.error(error instanceof Error ? error.stack : 'Unexpected error', 'API');
    }
    response.status(status).json({ message });
  }
}
