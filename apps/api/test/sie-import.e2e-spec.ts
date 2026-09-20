import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { COMPANY_HEADER } from '../src/companies/company.guard.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/synthetic-company.se',
);

// Org numbers reserved for this suite, so cleanup never touches other rows.
const ORG_A = '999901-0001';
const ORG_B = '999901-0002';

describe('SIE import (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let companyA: string;
  let companyB: string;

  async function removeTestCompanies(): Promise<void> {
    await prisma.company.deleteMany({
      where: { orgNumber: { in: [ORG_A, ORG_B] } },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await removeTestCompanies();

    const a = await request(app.getHttpServer())
      .post('/companies')
      .send({ name: 'Testbolaget A AB', orgNumber: ORG_A })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post('/companies')
      .send({ name: 'Testbolaget B AB', orgNumber: ORG_B })
      .expect(201);

    companyA = a.body.id;
    companyB = b.body.id;
  });

  afterAll(async () => {
    await removeTestCompanies();
    await app.close();
  });

  it('refuses a scoped route that names no company', async () => {
    await request(app.getHttpServer()).get('/ledger/accounts').expect(400);
  });

  it('imports the chart of accounts and every verification', async () => {
    const response = await request(app.getHttpServer())
      .post('/sie/import')
      .set(COMPANY_HEADER, companyA)
      .attach('file', readFileSync(fixture), 'synthetic-company.se')
      .expect(201);

    expect(response.body.accounts).toBe(10);
    expect(response.body.verifications).toBe(4);
    expect(response.body.companyName).toBe('Exempelbolaget AB');
  });

  it('classifies bank and VAT accounts from the BAS ranges', async () => {
    const response = await request(app.getHttpServer())
      .get('/ledger/accounts')
      .set(COMPANY_HEADER, companyA)
      .expect(200);

    const roleOf = (number: string) =>
      response.body.find(
        (account: { number: string }) => account.number === number,
      )?.role;

    expect(roleOf('1930')).toBe('BANK');
    expect(roleOf('2641')).toBe('VAT');
    expect(roleOf('5420')).toBe('OTHER');
  });

  it('keeps Swedish account names intact through CP437 decoding', async () => {
    const response = await request(app.getHttpServer())
      .get('/ledger/accounts')
      .set(COMPANY_HEADER, companyA)
      .expect(200);

    const bank = response.body.find(
      (account: { number: string }) => account.number === '1930',
    );
    expect(bank.name).toBe('Företagskonto');
  });

  // The guard is the only source of tenancy, so a second company sees none of
  // the first one's data even though both are in the same installation.
  it('shows another company none of the imported data', async () => {
    const summary = await request(app.getHttpServer())
      .get('/ledger/summary')
      .set(COMPANY_HEADER, companyB)
      .expect(200);

    expect(summary.body.accounts).toBe(0);
    expect(summary.body.verifications).toBe(0);
  });

  it('treats a re-import as a new import rather than an edit', async () => {
    await request(app.getHttpServer())
      .post('/sie/import')
      .set(COMPANY_HEADER, companyA)
      .attach('file', readFileSync(fixture), 'synthetic-company.se')
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get('/ledger/summary')
      .set(COMPANY_HEADER, companyA)
      .expect(200);

    expect(summary.body.imports).toBe(2);
    expect(summary.body.verifications).toBe(8);
    expect(summary.body.accounts).toBe(10);
  });

  it('reports a malformed file as a bad request, not a server error', async () => {
    await request(app.getHttpServer())
      .post('/sie/import')
      .set(COMPANY_HEADER, companyA)
      .attach(
        'file',
        Buffer.from('#VER "A" "1" 20260101 "x"\n{\n#TRANS 5420 {} 1.00\n}\n'),
        'bad.se',
      )
      .expect(400);
  });
});
