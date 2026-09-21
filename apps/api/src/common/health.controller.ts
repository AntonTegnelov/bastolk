import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  /// False while training holds the GPU, or if Ollama is down. Suggestions
  /// keep working from the nearest-neighbour model either way, so this is
  /// reported rather than fatal.
  llm: boolean;
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
    const database = await this.pingDatabase();
    const llm = await this.pingOllama();

    return { status: database ? 'ok' : 'degraded', database, llm };
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
