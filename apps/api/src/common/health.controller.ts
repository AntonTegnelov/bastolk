import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModelStatus } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  /// True only when a model version is active and the server that holds it
  /// answers. False while training holds the GPU, and false before any model
  /// has been trained. Suggestions keep coming from the nearest-neighbour
  /// model either way, so this is reported rather than fatal.
  llm: boolean;
  modelServer: boolean;
  activeModel: string | null;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Readiness of the database and the model server' })
  async check(): Promise<HealthResponse> {
    const [database, modelServer, active] = await Promise.all([
      this.pingDatabase(),
      this.pingOllama(),
      this.prisma.modelVersion.findFirst({
        where: { status: ModelStatus.ACTIVE },
      }),
    ]);

    return {
      status: database ? 'ok' : 'degraded',
      database,
      llm: modelServer && active !== null,
      modelServer,
      activeModel: active?.name ?? null,
    };
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingOllama(): Promise<boolean> {
    const base = this.config.getOrThrow<string>('OLLAMA_URL');
    try {
      const response = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
