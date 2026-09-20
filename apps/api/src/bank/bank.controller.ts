import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { BankTransaction, Company } from '@prisma/client';
import { CompanyGuard } from '../companies/company.guard.js';
import { CurrentCompany } from '../companies/current-company.decorator.js';
import { BankService, type BankImportResult } from './bank.service.js';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';

@ApiTags('bank')
@Controller('bank')
@UseGuards(CompanyGuard)
export class BankController {
  constructor(private readonly bank: BankService) {}

  @Post('import')
  @ApiOperation({ summary: 'Import a bank CSV of transactions to be coded' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @CurrentCompany() company: Company,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<BankImportResult> {
    if (!file) {
      throw new BadRequestException(
        'A bank CSV is required in the "file" field',
      );
    }

    return this.bank.importCsv(company, file.buffer);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Imported bank transactions, newest first' })
  async transactions(
    @CurrentCompany() company: Company,
    @Query() query: ListTransactionsDto,
  ): Promise<BankTransaction[]> {
    return this.bank.list(company, query.limit);
  }
}
