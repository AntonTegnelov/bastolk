import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Company } from '@prisma/client';
import { CompanyGuard } from '../companies/company.guard.js';
import { CurrentCompany } from '../companies/current-company.decorator.js';
import { DomainErrorFilter } from './domain-error.filter.js';
import { DecideDto } from './dto/decide.dto.js';
import { GenerateDto } from './dto/generate.dto.js';
import {
  SuggestionsService,
  type GenerateResult,
  type SuggestionView,
} from './suggestions.service.js';

@ApiTags('suggestions')
@Controller('suggestions')
@UseGuards(CompanyGuard)
@UseFilters(DomainErrorFilter)
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Propose an entry for every transaction that has none',
  })
  async generate(
    @CurrentCompany() company: Company,
    @Query() query: GenerateDto,
  ): Promise<GenerateResult> {
    return this.suggestions.generate(company, query.limit);
  }

  @Get()
  @ApiOperation({
    summary: 'Transactions with their current proposal and entry preview',
  })
  async list(
    @CurrentCompany() company: Company,
    @Query() query: GenerateDto,
  ): Promise<SuggestionView[]> {
    return this.suggestions.list(company, query.limit);
  }

  @Post(':transactionId/decide')
  @ApiOperation({
    summary: 'Approve or correct a proposal, creating the journal entry',
  })
  async decide(
    @CurrentCompany() company: Company,
    @Param('transactionId') transactionId: string,
    @Body() body: DecideDto,
  ) {
    return this.suggestions.decide(company, transactionId, body);
  }
}
