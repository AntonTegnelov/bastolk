import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { BankTransaction, Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { BankFormatError } from './parser/errors.js';
import { parseBankCsv } from './parser/parse-bank-csv.js';

export interface BankImportResult {
  parsed: number;
  imported: number;
  duplicates: number;
}

@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importCsv(
    company: Company,
    contents: Buffer,
  ): Promise<BankImportResult> {
    let rows;
    try {
      rows = parseBankCsv(contents);
    } catch (error) {
      if (error instanceof BankFormatError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    // The hash is unique per company, so re-uploading an overlapping export
    // adds only what is new instead of duplicating what is already there.
    const created = await this.prisma.bankTransaction.createMany({
      data: rows.map((row) => ({
        companyId: company.id,
        bookedOn: new Date(row.bookedOn),
        text: row.text,
        amountOre: row.amountOre,
        hash: row.hash,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Bank import: ${created.count} of ${rows.length} rows were new`,
    );

    return {
      parsed: rows.length,
      imported: created.count,
      duplicates: rows.length - created.count,
    };
  }

  async list(company: Company, limit: number): Promise<BankTransaction[]> {
    return this.prisma.bankTransaction.findMany({
      where: { companyId: company.id },
      orderBy: { bookedOn: 'desc' },
      take: limit,
    });
  }
}
