import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Account, Company } from '@prisma/client';
import { CompanyGuard } from '../companies/company.guard.js';
import { CurrentCompany } from '../companies/current-company.decorator.js';
import { ListVerificationsDto } from './dto/list-verifications.dto.js';
import {
  LedgerService,
  type LedgerSummary,
  type VerificationWithLines,
} from './ledger.service.js';

@ApiTags('ledger')
@Controller('ledger')
@UseGuards(CompanyGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Counts and date range of the imported history' })
  async summary(@CurrentCompany() company: Company): Promise<LedgerSummary> {
    return this.ledger.summary(company);
  }

  @Get('accounts')
  @ApiOperation({ summary: "This company's chart of accounts" })
  async accounts(@CurrentCompany() company: Company): Promise<Account[]> {
    return this.ledger.listAccounts(company);
  }

  @Get('verifications')
  @ApiOperation({ summary: 'Imported verifications, newest first' })
  async verifications(
    @CurrentCompany() company: Company,
    @Query() query: ListVerificationsDto,
  ): Promise<VerificationWithLines[]> {
    return this.ledger.listVerifications(company, query.limit);
  }
}
