import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Request, Response, NextFunction, json } from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const origins = (
    process.env.APP_ORIGIN ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000'
  )
    .split(',')
    .map((value) => value.trim());
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
  }
  z.object({ production: z.boolean(), origins: z.array(z.url()).min(1) })
    .refine(
      (config) =>
        !config.production || config.origins.every((origin) => origin.startsWith('https://')),
      { message: 'Production requires an HTTPS APP_ORIGIN.' },
    )
    .parse({ production: process.env.NODE_ENV === 'production', origins });
  app.use(helmet());
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Muitas solicitações. Aguarde um minuto.' },
    }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Muitas tentativas. Aguarde 15 minutos.' },
    }),
  );
  app.use((request: Request, response: Response, next: NextFunction) => {
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    if (mutation && ((origin && !origins.includes(origin)) || site === 'cross-site')) {
      response.status(403).json({ message: 'Origem da solicitação não permitida.' });
    } else {
      next();
    }
  });
  app.use(json({ limit: '1mb' }));
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrorFilter());
  const frontend = resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontend)) {
    app.useStaticAssets(frontend);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (
        request.method === 'GET' &&
        !request.path.startsWith('/api') &&
        !request.path.includes('.')
      ) {
        response.sendFile(resolve(frontend, 'index.html'));
      } else {
        next();
      }
    });
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
}
bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
