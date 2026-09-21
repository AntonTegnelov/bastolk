import type { Company } from '@prisma/client';
import type { Request } from 'express';

/// A request that has passed CompanyGuard. The guard is the only thing that
/// sets `company`, which is what keeps tenancy out of request bodies.
export interface CompanyScopedRequest extends Request {
  company?: Company;
}
