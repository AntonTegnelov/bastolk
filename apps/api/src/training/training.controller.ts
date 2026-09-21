import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Company, ModelVersion } from '@prisma/client';
import { CompanyGuard } from '../companies/company.guard.js';
import { CurrentCompany } from '../companies/current-company.decorator.js';
import { EvaluationService } from './evaluation.service.js';
import type { EvaluationMetrics, PromotionVerdict } from './metrics.js';
import { ModelRegistryService } from './model-registry.service.js';

@ApiTags('models')
@Controller('models')
@UseGuards(CompanyGuard)
export class TrainingController {
  constructor(
    private readonly registry: ModelRegistryService,
    private readonly evaluation: EvaluationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Every trained model version with the metrics it was judged on',
  })
  async list(): Promise<ModelVersion[]> {
    return this.registry.list();
  }

  @Post('evaluate')
  @ApiOperation({
    summary: "Score a predictor on this company's held-out months",
    description:
      'The predictor is given a date filter so it cannot see the test months. ' +
      'The baseline is reported in every comparison: a fine-tuned model without ' +
      'one beside it is not a result.',
  })
  async evaluate(
    @CurrentCompany() company: Company,
    @Query('predictor') predictor?: string,
  ): Promise<EvaluationMetrics> {
    return this.evaluation.evaluate(
      company,
      predictor === 'knn' ? 'knn' : 'active',
    );
  }

  @Post(':id/promote')
  @ApiOperation({
    summary: 'Run the promotion gate against the active version',
  })
  async promote(
    @Param('id') id: string,
  ): Promise<{ version: ModelVersion; verdict: PromotionVerdict }> {
    return this.registry.promote(id);
  }
}
