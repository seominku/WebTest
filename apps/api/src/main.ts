import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  loadLocalEnvironment,
  validateEnvironment,
} from './config/environment.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  loadLocalEnvironment();
  validateEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 4000);
  configureApp(app);

  await app.listen(port, '0.0.0.0');
}
await bootstrap();
