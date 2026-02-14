import { NestFactory } from '@nestjs/core';
import { apiReference } from '@scalar/nestjs-api-reference';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ClintModule } from '@/modules/clint/clint.module';
import { ImportsModule } from '@/modules/imports/imports.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { LeadsV2Module } from '@/modules/leads-v2/leads-v2.module';
import { MetricsModule } from '@/modules/metrics/metrics.module';
import { AppModule } from './app.module';
import { V1DeprecationInterceptor } from '@/infra/http/interceptors/v1-deprecation.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: '*',
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: true,
  });

  const openApiV1Config = new DocumentBuilder()
    .setTitle('Tetra Metrics API - V1')
    .setDescription('Documentação dos endpoints legados (v1).')
    .setVersion('1.0.0')
    .build();

  const openApiV2Config = new DocumentBuilder()
    .setTitle('Tetra Metrics API - V2')
    .setDescription('Documentação dos endpoints V2.')
    .setVersion('2.0.0')
    .build();

  const openApiV1Document = SwaggerModule.createDocument(app, openApiV1Config, {
    include: [LeadsModule, ImportsModule, MetricsModule, ClintModule],
  });
  const openApiV2Document = SwaggerModule.createDocument(app, openApiV2Config, {
    include: [LeadsV2Module],
  });

  app.use(
    '/docs/v1',
    apiReference({
      content: openApiV1Document,
      theme: 'default',
      darkMode: true,
    }),
  );

  app.use(
    '/docs/v2',
    apiReference({
      content: openApiV2Document,
      theme: 'default',
      darkMode: true,
    }),
  );

  app.use('/docs', (request: Request, response: Response, next: () => void) => {
    if (request.path === '/' || request.path === '') {
      response.redirect('/docs/v2');
      return;
    }

    next();
  });

  app.useGlobalInterceptors(new V1DeprecationInterceptor());

  await app.listen(process.env.PORT ?? 3333, '0.0.0.0');
}
bootstrap();
