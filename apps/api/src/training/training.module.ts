import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module.js';
import { PredictorsModule } from '../predictors/predictors.module.js';
import { EvaluationService } from './evaluation.service.js';
import { ModelRegistryService } from './model-registry.service.js';
import { TrainingController } from './training.controller.js';

@Module({
  imports: [CompaniesModule, PredictorsModule],
  controllers: [TrainingController],
  providers: [ModelRegistryService, EvaluationService],
  exports: [ModelRegistryService, EvaluationService],
})
export class TrainingModule {}
