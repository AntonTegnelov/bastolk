import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { SieModule } from './sie/sie.module.js';

@Module({
  imports: [CommonModule, CompaniesModule, SieModule, LedgerModule],
})
export class AppModule {}
