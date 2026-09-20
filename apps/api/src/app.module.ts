import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';

@Module({
  imports: [CommonModule, CompaniesModule],
})
export class AppModule {}
