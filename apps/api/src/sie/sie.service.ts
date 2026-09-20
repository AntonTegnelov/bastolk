import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { TrainingExamplesService } from '../predictors/training-examples.service.js';
import { classifyAccount } from '../rules/bas.js';
import { decodeSie } from './parser/decode.js';
import { SieFormatError } from './parser/errors.js';
import { parseSie } from './parser/parse-sie.js';

export interface SieImportResult {
  importId: string;
  companyName: string | null;
  accounts: number;
  verifications: number;
  lines: number;
  /// Verifications that became nearest-neighbour examples. The rest had more
  /// than one non-bank, non-VAT line and are not what a bank transaction looks
  /// like.
  examples: number;
}

@Injectable()
export class SieService {
  private readonly logger = new Logger(SieService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trainingExamples: TrainingExamplesService,
  ) {}

  /// Imported history is immutable, so every import creates its own rows. A
  /// re-import is a new import, never an update of the old one.
  async importFile(
    company: Company,
    filename: string,
    contents: Buffer,
  ): Promise<SieImportResult> {
    const parsed = this.parseOrReject(contents);

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sieImport.create({
        data: { companyId: company.id, filename },
      });

      // The chart of accounts is the company's current one, so accounts are
      // kept up to date across imports rather than duplicated per import.
      for (const account of parsed.accounts) {
        await tx.account.upsert({
          where: {
            companyId_number: { companyId: company.id, number: account.number },
          },
          create: {
            companyId: company.id,
            number: account.number,
            name: account.name,
            role: classifyAccount(account.number),
          },
          update: { name: account.name, role: classifyAccount(account.number) },
        });
      }

      let lines = 0;
      for (const verification of parsed.verifications) {
        await tx.verification.create({
          data: {
            companyId: company.id,
            importId: created.id,
            series: verification.series,
            number: verification.number,
            date: new Date(verification.date),
            text: verification.text,
            lines: {
              create: verification.transactions.map((transaction) => ({
                accountNumber: transaction.accountNumber,
                amountOre: transaction.amountOre,
                text: transaction.text,
              })),
            },
          },
        });
        lines += verification.transactions.length;
      }

      this.logger.log(
        `Imported ${filename}: ${parsed.accounts.length} accounts, ${parsed.verifications.length} verifications`,
      );

      return {
        importId: created.id,
        companyName: parsed.companyName,
        accounts: parsed.accounts.length,
        verifications: parsed.verifications.length,
        lines,
      };
    });

    // Embedding runs outside the transaction: it is CPU work measured in
    // seconds, and holding a database transaction open for it would block
    // every other write for no benefit.
    const examples = await this.trainingExamples.storeFromVerifications(
      company.id,
      parsed.verifications,
    );

    return { ...result, examples };
  }

  /// The file is input from outside, so a format failure is reported to the
  /// caller with its cause rather than surfacing as a 500.
  private parseOrReject(contents: Buffer) {
    try {
      return parseSie(decodeSie(contents));
    } catch (error) {
      if (error instanceof SieFormatError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
