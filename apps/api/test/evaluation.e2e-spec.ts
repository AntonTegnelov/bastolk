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
import { KnnPredictor } from '../src/predictors/knn.predictor.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/synthetic-company.se',
);
const ORG = '999903-0001';

describe('Evaluation (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let knn: KnnPredictor;
  let companyId: string;

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
    knn = app.get(KnnPredictor);
    await prisma.company.deleteMany({ where: { orgNumber: ORG } });

    const created = await request(app.getHttpServer())
      .post('/companies')
      .send({ name: 'Mätbolaget AB', orgNumber: ORG })
      .expect(201);
    companyId = created.body.id;

    await request(app.getHttpServer())
      .post('/sie/import')
      .set(COMPANY_HEADER, companyId)
      .attach('file', readFileSync(fixture), 'synthetic-company.se')
      .expect(201);
  }, 180_000);

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { orgNumber: ORG } });
    await app.close();
  });

  // The whole reported accuracy of this project rests on this. Recurring
  // suppliers appear dozens of times, so a baseline allowed to see the test
  // months would look up its own answers and report memorisation as accuracy.
  it('hides examples dated on or after the cutoff from the baseline', async () => {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    const transaction = {
      text: 'EU SOFTWARE',
      amountOre: -103681,
      bookedOn: new Date('2026-02-02'),
    };

    const withHistory = await knn.predict(company, transaction);
    const withoutHistory = await knn.predict(company, transaction, {
      onlyBefore: new Date('2026-01-01'),
    });

    // The matching example is dated 2026-02-02, so it is visible in the first
    // call and must be absent from the second.
    expect(withHistory.evidence.kind).toBe('neighbours');
    expect(withHistory.candidates[0]?.accountNumber).toBe('5420');

    if (withoutHistory.evidence.kind === 'neighbours') {
      for (const match of withoutHistory.evidence.matches) {
        expect(match.occurredOn < '2026-01-01').toBe(true);
      }
    }
  }, 180_000);

  it('reports the number of examples beside every figure', async () => {
    const metrics = await request(app.getHttpServer())
      .post('/models/evaluate?predictor=knn')
      .set(COMPANY_HEADER, companyId)
      .expect(201);

    expect(metrics.body.examples).toBeGreaterThan(0);
    expect(metrics.body.testFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(metrics.body.testTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(metrics.body.predictor).toBe('knn');
  }, 180_000);

  it('refuses to invent a figure for a company with no history', async () => {
    const empty = await request(app.getHttpServer())
      .post('/companies')
      .send({ name: 'Tomt AB', orgNumber: '999903-0002' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/models/evaluate?predictor=knn')
      .set(COMPANY_HEADER, empty.body.id)
      .expect(400);

    await prisma.company.deleteMany({ where: { orgNumber: '999903-0002' } });
  });
});
