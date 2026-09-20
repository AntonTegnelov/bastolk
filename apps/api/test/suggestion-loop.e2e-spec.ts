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

const here = dirname(fileURLToPath(import.meta.url));
const sieFixture = join(here, 'fixtures/synthetic-company.se');
const bankFixture = join(here, 'fixtures/synthetic-bank.csv');

const ORG = '999902-0001';

describe('Suggestion loop (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let company: string;

  const withCompany = (req: request.Test) => req.set(COMPANY_HEADER, company);

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
    await prisma.company.deleteMany({ where: { orgNumber: ORG } });

    const created = await request(app.getHttpServer())
      .post('/companies')
      .send({ name: 'Loopbolaget AB', orgNumber: ORG })
      .expect(201);
    company = created.body.id;

    await withCompany(request(app.getHttpServer()).post('/sie/import'))
      .attach('file', readFileSync(sieFixture), 'synthetic-company.se')
      .expect(201);
    await withCompany(request(app.getHttpServer()).post('/bank/import'))
      .attach('file', readFileSync(bankFixture), 'synthetic-bank.csv')
      .expect(201);
  }, 120_000);

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { orgNumber: ORG } });
    await app.close();
  });

  it('turns history into nearest-neighbour examples, skipping the salary run', async () => {
    // Four verifications, of which the salary has two non-bank, non-VAT lines.
    const examples = await prisma.trainingExample.count({
      where: { companyId: company },
    });

    expect(examples).toBe(3);
  });

  it('imports the bank file once, however many times it is uploaded', async () => {
    const again = await withCompany(
      request(app.getHttpServer()).post('/bank/import'),
    )
      .attach('file', readFileSync(bankFixture), 'synthetic-bank.csv')
      .expect(201);

    expect(again.body.parsed).toBe(6);
    expect(again.body.imported).toBe(0);
    expect(again.body.duplicates).toBe(6);
  });

  it('proposes an entry for every transaction and builds balanced lines', async () => {
    const generated = await withCompany(
      request(app.getHttpServer()).post('/suggestions/generate'),
    ).expect(201);

    expect(generated.body.suggested).toBeGreaterThan(0);

    const list = await withCompany(
      request(app.getHttpServer()).get('/suggestions'),
    ).expect(200);

    for (const row of list.body) {
      if (!row.suggestion) {
        continue;
      }
      const total = row.suggestion.lines.reduce(
        (sum: number, line: { amountOre: number }) => sum + line.amountOre,
        0,
      );
      expect(total).toBe(0);
    }
  }, 120_000);

  it('shows the past entries behind a proposal as its evidence', async () => {
    const list = await withCompany(
      request(app.getHttpServer()).get('/suggestions'),
    ).expect(200);
    const withEvidence = list.body.find(
      (row: { suggestion?: { evidence?: { kind: string } } }) =>
        row.suggestion?.evidence?.kind === 'neighbours',
    );

    expect(withEvidence).toBeDefined();
    expect(withEvidence.suggestion.evidence.matches.length).toBeGreaterThan(0);
  });

  it('refuses an account the company does not have, whatever asked for it', async () => {
    const list = await withCompany(
      request(app.getHttpServer()).get('/suggestions'),
    ).expect(200);
    const target = list.body.find((row: { decided: boolean }) => !row.decided);

    await withCompany(
      request(app.getHttpServer()).post(
        `/suggestions/${target.transactionId}/decide`,
      ),
    )
      .send({ accountNumber: '9999', vatTreatment: 'NONE' })
      .expect(400);
  });

  // The correction loop: a person disagrees, and the next similar transaction
  // is proposed the corrected way because the correction is a stored example.
  it('learns from a correction immediately', async () => {
    const before = await withCompany(
      request(app.getHttpServer()).get('/suggestions'),
    ).expect(200);
    const target = before.body.find(
      (row: { decided: boolean; text: string }) =>
        !row.decided && row.text === 'EXEMPEL EMEA',
    );
    expect(target).toBeDefined();

    const decided = await withCompany(
      request(app.getHttpServer()).post(
        `/suggestions/${target.transactionId}/decide`,
      ),
    )
      .send({ accountNumber: '4535', vatTreatment: 'REVERSE_CHARGE_EU' })
      .expect(201);

    expect(
      decided.body.lines.reduce(
        (s: number, l: { amountOre: number }) => s + l.amountOre,
        0,
      ),
    ).toBe(0);

    const correction = await prisma.trainingExample.findFirst({
      where: { companyId: company, source: 'CORRECTION' },
    });
    expect(correction?.accountNumber).toBe('4535');

    const journalEntries = await prisma.journalEntry.count({
      where: { companyId: company },
    });
    expect(journalEntries).toBe(1);
  }, 120_000);

  it('refuses to decide the same transaction twice', async () => {
    const list = await withCompany(
      request(app.getHttpServer()).get('/suggestions'),
    ).expect(200);
    const decided = list.body.find((row: { decided: boolean }) => row.decided);

    await withCompany(
      request(app.getHttpServer()).post(
        `/suggestions/${decided.transactionId}/decide`,
      ),
    )
      .send({ accountNumber: '5420', vatTreatment: 'NONE' })
      .expect(400);
  });
});
