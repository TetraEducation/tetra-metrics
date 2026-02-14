import { NestFactory } from '@nestjs/core';
import { apiReference } from '@scalar/nestjs-api-reference';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: '*',
    allowedHeaders: '*',
    exposedHeaders: '*',
    credentials: true,
  });

  const openApiConfig = new DocumentBuilder()
    .setTitle('Tetra Metrics API')
    .setDescription('Documentação dos endpoints da API, incluindo a versão v2 de leads.')
    .setVersion('2.0.0')
    .build();

  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);

  app.use(
    '/docs',
    apiReference({
      content: openApiDocument,
      theme: 'default',
      darkMode: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3333, '0.0.0.0');
}
bootstrap();
