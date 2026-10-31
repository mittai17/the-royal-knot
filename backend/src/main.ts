import 'reflect-metadata';
import { Logger, ValidationPipe, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DEV_JWT_SECRET, env } from './config/env';

export function configure(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: env.frontendUrl.split(',').map((s) => s.trim()), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false, transformOptions: { enableImplicitConversion: false } }));
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('The Royal Knot API').setDescription('Self-hosted wedding operations platform. Money values are decimal strings in INR.').setVersion('1.0').addCookieAuth('access_token').build());
  SwaggerModule.setup('api/docs', app, doc);
}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && (env.jwtSecret === DEV_JWT_SECRET || env.jwtSecret.length < 24)) throw new Error('Refusing to start: set JWT_SECRET (or JWT_ACCESS_SECRET) to a long random value in production');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configure(app);
  app.enableShutdownHooks();
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(`API on :${env.port}/api/v1  ·  docs /api/docs`);
}
if (require.main === module) bootstrap();
