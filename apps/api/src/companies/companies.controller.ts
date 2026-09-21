import { Body, Controller, Get, Post } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';

/// The company list is the one place that is deliberately not scoped to a
/// company: it is how a client discovers which ids exist to send in the header.
@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Every company in this installation' })
  async list(): Promise<Company[]> {
    return this.companies.list();
  }

  @Post()
  @ApiOperation({ summary: 'Register a company' })
  async create(@Body() dto: CreateCompanyDto): Promise<Company> {
    return this.companies.create(dto);
  }
}
