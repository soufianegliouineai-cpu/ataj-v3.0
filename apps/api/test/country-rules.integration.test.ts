import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const enabled = Boolean(process.env.DATABASE_URL);
let app: INestApplication;

before(async () => {
  if (!enabled) return;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

after(async () => {
  if (app) await app.close();
});

test('Morocco pack exposes active primary-source rules without automatic legal deadlines', { skip: !enabled }, async () => {
  const response = await request(app.getHttpServer())
    .get('/v1/country-packs/MA')
    .expect(200);

  assert.equal(response.body.data.jurisdiction, 'MA');
  assert.equal(response.body.data.status, 'pilot');
  assert.equal(response.body.data.trustPolicy.activeRulesRequirePrimarySource, true);
  assert.equal(response.body.data.trustPolicy.automaticDeadlineDefault, false);
  assert.equal(response.body.data.trustPolicy.actualExpiryDeadlinesUseDocumentFact, true);

  const rules = response.body.data.rules as Array<{
    code: string;
    automaticDeadline: boolean;
    sourceCode: string;
  }>;

  assert.deepEqual(
    new Set(rules.map((rule) => rule.code)),
    new Set([
      'passport_biometric_validity',
      'cnie_validity',
      'passport_requires_valid_cnie_12_plus',
    ]),
  );
  assert.ok(rules.every((rule) => rule.automaticDeadline === false));

  const sources = response.body.data.sources as Array<{
    code: string;
    url: string;
    verifiedOn: string;
  }>;
  assert.equal(sources.length, 3);
  assert.ok(sources.every((source) => source.url.startsWith('https://www.passeport.ma/')));
  assert.ok(sources.every((source) => source.verifiedOn === '2026-10-05'));
});

test('Morocco passport requirement evaluator is deterministic and evidence-linked', { skip: !enabled }, async () => {
  const missing = await request(app.getHttpServer())
    .post('/v1/country-packs/MA/evaluate')
    .send({
      ruleCode: 'passport_requires_valid_cnie_12_plus',
      ageYears: 34,
      documents: [],
    })
    .expect(201);

  assert.equal(missing.body.data.result.applies, true);
  assert.equal(missing.body.data.result.satisfied, false);
  assert.deepEqual(missing.body.data.result.missingRequirements, [
    { documentType: 'identity_card', requiredState: 'valid' },
  ]);
  assert.equal(missing.body.data.result.automaticTask, false);
  assert.equal(missing.body.data.result.automaticDeadline, false);
  assert.equal(missing.body.data.rule.version, 1);
  assert.equal(missing.body.data.evidence.code, 'MA_PASSPORT_DELIVERY_CONDITIONS');

  const satisfied = await request(app.getHttpServer())
    .post('/v1/country-packs/MA/evaluate')
    .send({
      ruleCode: 'passport_requires_valid_cnie_12_plus',
      ageYears: 34,
      documents: [{ type: 'identity_card', state: 'valid' }],
    })
    .expect(201);

  assert.equal(satisfied.body.data.result.applies, true);
  assert.equal(satisfied.body.data.result.satisfied, true);
  assert.deepEqual(satisfied.body.data.result.missingRequirements, []);

  const underTwelve = await request(app.getHttpServer())
    .post('/v1/country-packs/MA/evaluate')
    .send({
      ruleCode: 'passport_requires_valid_cnie_12_plus',
      ageYears: 11,
      documents: [],
    })
    .expect(201);

  assert.equal(underTwelve.body.data.result.applies, false);
  assert.equal(underTwelve.body.data.result.satisfied, true);
});

test('country rule API rejects unsupported packs and informational-rule evaluation', { skip: !enabled }, async () => {
  const missingPack = await request(app.getHttpServer())
    .get('/v1/country-packs/US')
    .expect(404);
  assert.equal(missingPack.body.error.code, 'COUNTRY_PACK_NOT_FOUND');

  const informational = await request(app.getHttpServer())
    .post('/v1/country-packs/MA/evaluate')
    .send({
      ruleCode: 'passport_biometric_validity',
      ageYears: 34,
      documents: [],
    })
    .expect(422);
  assert.equal(informational.body.error.code, 'COUNTRY_RULE_NOT_EVALUATABLE');
});
