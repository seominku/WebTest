import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { DatabaseUnavailableFilter } from './infrastructure/database-unavailable.filter.js';

export function configureApp(app: INestApplication): void {
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);

  if (trustProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(name: string, value: number): void;
    };
    express.set('trust proxy', trustProxyHops);
  }

  app.use(helmet());
  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: webOrigin,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new DatabaseUnavailableFilter(app.getHttpAdapter()));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
