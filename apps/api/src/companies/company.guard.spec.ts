import {
  BadRequestException,
  type ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { COMPANY_HEADER, CompanyGuard } from './company.guard.js';
import type { CompanyScopedRequest } from './company-scoped-request.js';

const aCompany: Company = {
  id: 'company-1',
  name: 'Exempelbolaget AB',
  orgNumber: '556677-8899',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

/// A request carrying only what the guard reads, plus the context wrapper Nest
/// hands to canActivate.
function contextFor(headers: Record<string, string>): {
  context: ExecutionContext;
  request: CompanyScopedRequest;
} {
  const request = {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as CompanyScopedRequest;

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

async function guardWith(
  findUnique: () => Promise<Company | null>,
): Promise<CompanyGuard> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompanyGuard,
      // The seam: the guard asks for PrismaService by type, and the testing
      // module answers with this object instead. No monkeypatching, and the
      // guard is unchanged.
      { provide: PrismaService, useValue: { company: { findUnique } } },
    ],
  }).compile();

  return moduleRef.get(CompanyGuard);
}

describe('CompanyGuard', () => {
  it('rejects a request that names no company', async () => {
    const guard = await guardWith(async () => aCompany);
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a company id that does not exist', async () => {
    const guard = await guardWith(async () => null);
    const { context } = contextFor({ [COMPANY_HEADER]: 'missing' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('puts the resolved company on the request so no handler reads it again', async () => {
    const guard = await guardWith(async () => aCompany);
    const { context, request } = contextFor({ [COMPANY_HEADER]: aCompany.id });

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.company).toEqual(aCompany);
  });
});
