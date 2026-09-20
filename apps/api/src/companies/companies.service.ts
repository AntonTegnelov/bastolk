import { ConflictException, Injectable } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Company[]> {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCompanyDto): Promise<Company> {
    const existing = await this.prisma.company.findUnique({
      where: { orgNumber: dto.orgNumber },
    });
    if (existing) {
      throw new ConflictException(
        `A company with org number ${dto.orgNumber} already exists`,
      );
    }

    return this.prisma.company.create({
      data: { name: dto.name, orgNumber: dto.orgNumber },
    });
  }
}
