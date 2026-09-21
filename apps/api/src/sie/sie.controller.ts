import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Company } from '@prisma/client';
import { CompanyGuard } from '../companies/company.guard.js';
import { CurrentCompany } from '../companies/current-company.decorator.js';
import { SieService, type SieImportResult } from './sie.service.js';

@ApiTags('sie')
@Controller('sie')
@UseGuards(CompanyGuard)
export class SieController {
  constructor(private readonly sie: SieService) {}

  @Post('import')
  @ApiOperation({
    summary: 'Import a SIE4 file of accounts and historical verifications',
  })
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
  ): Promise<SieImportResult> {
    if (!file) {
      throw new BadRequestException(
        'A SIE4 file is required in the "file" field',
      );
    }

    return this.sie.importFile(company, file.originalname, file.buffer);
  }
}
