import { Module } from '@nestjs/common';
import { BankModule } from './bank/bank.module.js';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { PredictorsModule } from './predictors/predictors.module.js';
import { SieModule } from './sie/sie.module.js';
import { SuggestionsModule } from './suggestions/suggestions.module.js';
import { TrainingModule } from './training/training.module.js';

@Module({
  imports: [
    CommonModule,
    CompaniesModule,
    PredictorsModule,
    SieModule,
    LedgerModule,
    BankModule,
    SuggestionsModule,
    TrainingModule,
  ],
})
export class AppModule {}
