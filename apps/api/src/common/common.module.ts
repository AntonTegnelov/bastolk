import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma.service.js';
import { validateEnv } from './env.validation.js';

/// Global so that feature modules contain only features: they inject
/// PrismaService and ConfigService without importing this module each time.
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CommonModule {}
