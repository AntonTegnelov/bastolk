import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import type { CompanyScopedRequest } from './company-scoped-request.js';

export const COMPANY_HEADER = 'x-company-id';

/// Tenancy is a cross-cutting rule, so it lives in a guard: no controller can
/// forget it, and no service has to be trusted to filter correctly. The guard
/// resolves the company once and hands the whole row to the request, so
/// downstream code never re-reads it.
@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CompanyScopedRequest>();
    const companyId = request.header(COMPANY_HEADER);

    if (!companyId) {
      throw new BadRequestException(`The ${COMPANY_HEADER} header is required`);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`No company with id ${companyId}`);
    }

    request.company = company;
    return true;
  }
}
