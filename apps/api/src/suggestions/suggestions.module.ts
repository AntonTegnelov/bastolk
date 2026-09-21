import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module.js';
import { PredictorsModule } from '../predictors/predictors.module.js';
import { SuggestionsController } from './suggestions.controller.js';
import { SuggestionsService } from './suggestions.service.js';

@Module({
  imports: [CompaniesModule, PredictorsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
  exports: [SuggestionsService],
})
export class SuggestionsModule {}
