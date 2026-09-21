import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('export')
  @ApiOperation({ summary: 'Download approved entries as a SIE4 file' })
  async export(
    @CurrentCompany() company: Company,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, contents } = await this.sie.exportApproved(company);

    // Written as bytes, not as a string: the file is CP437 and any encoding
    // applied on the way out would corrupt every Swedish name in it.
    response
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(contents);
  }
}
