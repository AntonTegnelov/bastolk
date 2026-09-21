import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module.js';
import { SieController } from './sie.controller.js';
import { SieService } from './sie.service.js';

@Module({
  imports: [CompaniesModule],
  controllers: [SieController],
  providers: [SieService],
  exports: [SieService],
})
export class SieModule {}
