import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // `rawBody: true` preserves the untouched request body alongside the parsed
  // one. The Stripe webhook signs the raw bytes, so any middleware that
  // re-serialised them would break verification for every payment.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['log', 'error', 'warn'],
  });

  // The SPA is served by nginx in front of this API, which proxies /api/ here.
  app.setGlobalPrefix('api');

  const corsOrigin = process.env.FRONTEND_URL ?? process.env.PUBLIC_BASE_URL;
  app.enableCors({
    origin: corsOrigin ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CNC Quick Quote API')
    .setDescription('Quoting, nesting, pricing, checkout and admin API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`CNC Quick Quote API listening on :${port} (routes under /api)`);
}

void bootstrap();
