import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { swaggerConfig } from './swagger-config.js';

/// Emits the API contract so the frontend's types are generated from the
/// backend's DTOs. CI regenerates this and fails on any difference, so the
/// two cannot silently drift apart.
const app = await NestFactory.create(AppModule, { logger: false });
const document = SwaggerModule.createDocument(app, swaggerConfig());

writeFileSync('openapi.json', `${JSON.stringify(document, null, 2)}\n`);
await app.close();

process.exit(0);
