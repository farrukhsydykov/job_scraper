import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * Starts the API, scheduler, and server-rendered dashboard.
 */
const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';
  const appRoot = isProduction ? __dirname : join(process.cwd(), 'src');
  const publicRoot = isProduction
    ? join(__dirname, 'public')
    : join(process.cwd(), 'public');

  app.setBaseViewsDir(join(appRoot, 'views'));
  app.setViewEngine('ejs');
  app.useStaticAssets(publicRoot);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
};

void bootstrap();
