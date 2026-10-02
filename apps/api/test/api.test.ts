import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

let app: INestApplication;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

after(async () => {
  await app.close();
});

test('GET /v1/health exposes NestJS parity runtime', async () => {
  const response = await request(app.getHttpServer()).get('/v1/health').expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.version, '0.3.0');
  assert.equal(response.body.runtime, 'nestjs');
  assert.equal(response.headers['x-lifeos-version'], '0.3.0');
  assert.ok(response.headers['x-request-id']);
});

test('GET /v1/document-types exposes supported types', async () => {
  const response = await request(app.getHttpServer()).get('/v1/document-types').expect(200);
  assert.ok(response.body.data.includes('passport'));
  assert.ok(response.body.data.includes('identity_card'));
  assert.ok(response.body.data.includes('driving_license'));
});

test('POST /v1/protection/expiry is deterministic with idempotency key', async () => {
  const body = {
    documentType: 'driving_license',
    expiryDate: '2027-08-20',
    leadDays: 60,
  };

  const first = await request(app.getHttpServer())
    .post('/v1/protection/expiry')
    .set('Idempotency-Key', 'nest-ci-001')
    .send(body)
    .expect(201);

  const second = await request(app.getHttpServer())
    .post('/v1/protection/expiry')
    .set('Idempotency-Key', 'nest-ci-001')
    .send(body)
    .expect(201);

  assert.equal(first.body.data.protectionId, second.body.data.protectionId);
  assert.equal(first.body.data.deadline.recommendedActionAt, '2027-06-21');
  assert.equal(first.body.data.document.facts[0].trustClass, 'USER_CONFIRMED');
  assert.equal(first.body.data.evidence.aiExtractionPerformed, false);
  assert.equal(first.body.data.evidence.legalRuleApplied, false);
});

test('validation rejects impossible calendar dates', async () => {
  const response = await request(app.getHttpServer())
    .post('/v1/protection/expiry')
    .send({ documentType: 'passport', expiryDate: '2027-02-30' })
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('validation rejects extra request fields', async () => {
  const response = await request(app.getHttpServer())
    .post('/v1/protection/expiry')
    .send({ documentType: 'passport', expiryDate: '2027-06-12', secretOverride: true })
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('idempotency keys longer than 200 characters are rejected', async () => {
  const response = await request(app.getHttpServer())
    .post('/v1/protection/expiry')
    .set('Idempotency-Key', 'x'.repeat(201))
    .send({ documentType: 'passport', expiryDate: '2027-06-12' })
    .expect(400);

  assert.equal(response.body.error.code, 'INVALID_IDEMPOTENCY_KEY');
});


test('GET /v1/readiness reports disabled dependencies truthfully', async () => {
  const response = await request(app.getHttpServer()).get('/v1/readiness').expect(200);
  assert.equal(response.body.capabilities.authentication, 'not_configured');
  assert.equal(response.body.capabilities.persistence, 'not_configured');
  assert.equal(response.body.capabilities.persistentProtection, 'not_configured');
  assert.equal(response.body.dependencies.oidc.configured, false);
});
