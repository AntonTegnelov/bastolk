import { Injectable } from '@nestjs/common';
import type {
  Account,
  Company,
  Verification,
  VerificationLine,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';

export interface LedgerSummary {
  accounts: number;
  verifications: number;
  imports: number;
  firstVerification: string | null;
  lastVerification: string | null;
}

export type VerificationWithLines = Verification & {
  lines: VerificationLine[];
};

/// The reference example of the plain Nest pattern: a controller, a service
/// and DTOs, with every query scoped by the company the guard resolved.
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(company: Company): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { companyId: company.id },
      orderBy: { number: 'asc' },
    });
  }

  async listVerifications(
    company: Company,
    limit: number,
  ): Promise<VerificationWithLines[]> {
    return this.prisma.verification.findMany({
      where: { companyId: company.id },
      orderBy: { date: 'desc' },
      take: limit,
      include: { lines: true },
    });
  }

  async summary(company: Company): Promise<LedgerSummary> {
    const [accounts, verifications, imports, oldest, newest] =
      await Promise.all([
        this.prisma.account.count({ where: { companyId: company.id } }),
        this.prisma.verification.count({ where: { companyId: company.id } }),
        this.prisma.sieImport.count({ where: { companyId: company.id } }),
        this.prisma.verification.findFirst({
          where: { companyId: company.id },
          orderBy: { date: 'asc' },
          select: { date: true },
        }),
        this.prisma.verification.findFirst({
          where: { companyId: company.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        }),
      ]);

    return {
      accounts,
      verifications,
      imports,
      firstVerification: oldest?.date.toISOString().slice(0, 10) ?? null,
      lastVerification: newest?.date.toISOString().slice(0, 10) ?? null,
    };
  }
}
