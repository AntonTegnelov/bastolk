import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanyGuard } from './company.guard.js';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyGuard],
  exports: [CompanyGuard],
})
export class CompaniesModule {}
