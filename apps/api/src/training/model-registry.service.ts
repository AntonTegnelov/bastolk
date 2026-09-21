import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ModelStatus, type ModelVersion, type Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import {
  decidePromotion,
  type EvaluationMetrics,
  type PromotionVerdict,
} from './metrics.js';

export interface RegisterVersionInput {
  readonly name: string;
  readonly baseModel: string;
  readonly datasetSize: number;
  readonly filePath: string | null;
  /// Null until the version has been scored on real held-out months. A
  /// version without them cannot be promoted, which is the gate refusing to
  /// judge a model on a figure from somewhere else.
  readonly metrics: EvaluationMetrics | null;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ModelVersion[]> {
    return this.prisma.modelVersion.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async active(): Promise<ModelVersion | null> {
    return this.prisma.modelVersion.findFirst({
      where: { status: ModelStatus.ACTIVE },
    });
  }

  async register(input: RegisterVersionInput): Promise<ModelVersion> {
    return this.prisma.modelVersion.create({
      data: {
        name: input.name,
        baseModel: input.baseModel,
        datasetSize: input.datasetSize,
        filePath: input.filePath,
        status: ModelStatus.READY,
        metrics: (input.metrics ?? undefined) as unknown as
          Prisma.InputJsonValue | undefined,
      },
    });
  }

  /// The gate. It reads stored metrics and compares like with like; it is not
  /// a judgement call, and there is no way to promote a version past it.
  async promote(
    versionId: string,
  ): Promise<{ version: ModelVersion; verdict: PromotionVerdict }> {
    const candidate = await this.prisma.modelVersion.findUnique({
      where: { id: versionId },
    });
    if (!candidate) {
      throw new NotFoundException(`No model version ${versionId}`);
    }
    if (!candidate.metrics) {
      // The version exists; it has simply never been scored on the held-out
      // months. Promoting it would mean promoting on nothing.
      throw new UnprocessableEntityException(
        `Model version ${candidate.name} has no held-out metrics, so there is nothing to judge it on`,
      );
    }

    const active = await this.active();
    const verdict = decidePromotion(
      candidate.metrics as unknown as EvaluationMetrics,
      (active?.metrics as unknown as EvaluationMetrics | undefined) ?? null,
    );

    if (!verdict.promote) {
      this.logger.warn(
        `Refused to promote ${candidate.name}: ${verdict.reason}`,
      );
      const rejected = await this.prisma.modelVersion.update({
        where: { id: candidate.id },
        data: { status: ModelStatus.REJECTED },
      });
      return { version: rejected, verdict };
    }

    // Exactly one version is active, because the fine-tuned model is shared
    // between companies.
    const promoted = await this.prisma.$transaction(async (tx) => {
      if (active) {
        await tx.modelVersion.update({
          where: { id: active.id },
          data: { status: ModelStatus.READY },
        });
      }
      return tx.modelVersion.update({
        where: { id: candidate.id },
        data: { status: ModelStatus.ACTIVE },
      });
    });

    this.logger.log(`Promoted ${promoted.name}: ${verdict.reason}`);
    return { version: promoted, verdict };
  }
}
