import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module.js';
import { BankController } from './bank.controller.js';
import { BankService } from './bank.service.js';

@Module({
  imports: [CompaniesModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
