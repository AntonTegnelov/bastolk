import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Company } from '@prisma/client';
import type { CompanyScopedRequest } from './company-scoped-request.js';

/// Reads the company that CompanyGuard resolved. Using this on a route with no
/// guard is a wiring mistake, and it throws rather than returning undefined so
/// the mistake shows up the first time the route is called.
export const CurrentCompany = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Company => {
    const request = context.switchToHttp().getRequest<CompanyScopedRequest>();

    if (!request.company) {
      throw new Error('CurrentCompany requires CompanyGuard on the same route');
    }

    return request.company;
  },
);
