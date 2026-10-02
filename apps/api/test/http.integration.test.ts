import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test, { after, before } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const enabled = Boolean(process.env.DATABASE_URL);
const issuer = 'https://integration.issuer.lifeos.test';
const audience = 'lifeos-api';
const ownerId = '00000000-0000-4000-8000-000000000201';
const outsiderId = '00000000-0000-4000-8000-000000000202';

let app: INestApplication;
let server: Server;
let privateKey: CryptoKey;
let jwk: JWK;

before(async () => {
  if (!enabled) return;

  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'lifeos-integration-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  server = createServer((req, res) => {
    if (req.url !== '/jwks') {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60',
    });
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_AUDIENCE = audience;
  process.env.OIDC_JWKS_URL = `http://127.0.0.1:${address.port}/jwks`;
  process.env.OIDC_ALLOWED_ALGS = 'RS256';
  process.env.OIDC_USER_ID_CLAIM = 'sub';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

after(async () => {
  if (app) await app.close();
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_AUDIENCE;
  delete process.env.OIDC_JWKS_URL;
  delete process.env.OIDC_ALLOWED_ALGS;
  delete process.env.OIDC_USER_ID_CLAIM;
});

async function signToken(userId: string) {
  return new SignJWT({
    email: userId === ownerId ? 'owner-http@example.test' : 'outsider-http@example.test',
    name: userId === ownerId ? 'HTTP Owner' : 'HTTP Outsider',
    scope: 'lifeos.write',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'lifeos-integration-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

test('authenticated HTTP flow creates household and persists protection graph', { skip: !enabled }, async () => {
  const token = await signToken(ownerId);

  const readiness = await request(app.getHttpServer())
    .get('/v1/readiness')
    .expect(200);

  assert.equal(readiness.body.capabilities.authentication, 'ready');
  assert.equal(readiness.body.capabilities.persistence, 'ready');

  const created = await request(app.getHttpServer())
    .post('/v1/households')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'HTTP Integration Household', homeJurisdiction: 'MA' })
    .expect(201);

  const householdId = created.body.data.id as string;
  assert.match(householdId, /^[0-9a-f-]{36}$/i);
  assert.equal(created.body.data.role, 'owner');
  assert.equal(created.body.data.homeJurisdiction, 'MA');

  const person = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      displayName: 'Dependent Person',
      relationship: 'child',
      dateOfBirth: '2018-05-14',
      nationality: 'MA',
      jurisdiction: 'MA',
    })
    .expect(201);

  const personId = person.body.data.id as string;
  assert.match(personId, /^[0-9a-f-]{36}$/i);
  assert.equal(person.body.data.householdId, householdId);
  assert.equal(person.body.data.relationship, 'child');

  const people = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.ok(people.body.data.some((item: { id: string }) => item.id === personId));

  const body = {
    documentType: 'passport',
    expiryDate: '2028-12-31',
    leadDays: 90,
    personId,
  };

  const first = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/protection/expiry`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'http-integration-protect-001')
    .send(body)
    .expect(201);

  assert.equal(first.body.meta.persisted, true);
  assert.equal(first.body.meta.replayed, false);
  assert.ok(first.body.data.persistence.documentId);
  assert.ok(first.body.data.persistence.obligationId);
  assert.ok(first.body.data.persistence.deadlineId);
  assert.ok(first.body.data.persistence.taskId);

  const replay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/protection/expiry`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'http-integration-protect-001')
    .send(body)
    .expect(201);

  assert.equal(replay.body.meta.replayed, true);
  assert.deepEqual(replay.body.data.persistence, first.body.data.persistence);

  const outsiderToken = await signToken(outsiderId);
  const denied = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/protection/expiry`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .set('Idempotency-Key', 'http-integration-outsider-001')
    .send(body)
    .expect(403);

  assert.equal(denied.body.error.code, 'ACCESS_DENIED');

  await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(200)
    .expect((response) => {
      assert.deepEqual(response.body.data, []);
    });

  const deniedPerson = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .send({ displayName: 'Unauthorized Person', relationship: 'other' })
    .expect(403);

  assert.equal(deniedPerson.body.error.code, 'ACCESS_DENIED');

  const secondHousehold = await request(app.getHttpServer())
    .post('/v1/households')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Second HTTP Household', homeJurisdiction: 'MA' })
    .expect(201);

  const crossHousehold = await request(app.getHttpServer())
    .post(`/v1/households/${secondHousehold.body.data.id}/protection/expiry`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'http-cross-household-person-001')
    .send({
      documentType: 'passport',
      expiryDate: '2029-01-31',
      leadDays: 90,
      personId,
    })
    .expect(404);

  assert.equal(crossHousehold.body.error.code, 'PERSON_NOT_FOUND');
});

test('persistent HTTP write requires idempotency key after authentication', { skip: !enabled }, async () => {
  const token = await signToken(ownerId);

  const created = await request(app.getHttpServer())
    .post('/v1/households')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Idempotency Test Household' })
    .expect(201);

  const response = await request(app.getHttpServer())
    .post(`/v1/households/${created.body.data.id}/protection/expiry`)
    .set('Authorization', `Bearer ${token}`)
    .send({ documentType: 'passport', expiryDate: '2028-12-31', leadDays: 90 })
    .expect(400);

  assert.equal(response.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});
