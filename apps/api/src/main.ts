import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';
import { swaggerConfig } from './swagger-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // whitelist strips properties the DTO does not declare, which is what stops
  // a request body from ever supplying a company id: the guard is the only
  // source of tenancy. forbidNonWhitelisted turns that silent strip into a 400.
  // Implicit conversion is deliberately off, because it would coerce amount
  // strings into floats and money here is integer ore.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());

  SwaggerModule.setup(
    'api',
    app,
    SwaggerModule.createDocument(app, swaggerConfig()),
  );

  // The Vite dev server is a separate origin during development.
  app.enableCors();

  // Binding to localhost would leave the container port mapping unreachable
  // from the host.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

await bootstrap();
