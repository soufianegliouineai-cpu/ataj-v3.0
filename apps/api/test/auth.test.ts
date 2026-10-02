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

const issuer = 'https://issuer.lifeos.test';
const audience = 'lifeos-api';
const userId = '00000000-0000-4000-8000-000000000099';

let app: INestApplication;
let server: Server;
let privateKey: CryptoKey;
let jwk: JWK;

before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'lifeos-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  server = createServer((req, res) => {
    if (req.url !== '/jwks') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
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
  await app?.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_AUDIENCE;
  delete process.env.OIDC_JWKS_URL;
  delete process.env.OIDC_ALLOWED_ALGS;
  delete process.env.OIDC_USER_ID_CLAIM;
});

async function signToken(subject = userId, tokenIssuer = issuer) {
  return new SignJWT({ scope: 'lifeos.write' })
    .setProtectedHeader({ alg: 'RS256', kid: 'lifeos-test-key' })
    .setIssuer(tokenIssuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

const route = '/v1/households/10000000-0000-4000-8000-000000000099/protection/expiry';
const body = { documentType: 'passport', expiryDate: '2028-06-12', leadDays: 90 };

test('persistent route requires a bearer token when OIDC is configured', async () => {
  const response = await request(app.getHttpServer())
    .post(route)
    .set('Idempotency-Key', 'auth-test-missing')
    .send(body)
    .expect(401);

  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('persistent route rejects an invalid issuer', async () => {
  const token = await signToken(userId, 'https://evil.example.test');

  const response = await request(app.getHttpServer())
    .post(route)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'auth-test-issuer')
    .send(body)
    .expect(401);

  assert.equal(response.body.error.code, 'INVALID_ACCESS_TOKEN');
});

test('persistent route rejects non-UUID configured user identity claims', async () => {
  const token = await signToken('not-a-uuid');

  const response = await request(app.getHttpServer())
    .post(route)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'auth-test-subject')
    .send(body)
    .expect(401);

  assert.equal(response.body.error.code, 'INVALID_USER_ID_CLAIM');
});

test('valid signed OIDC token reaches persistence boundary', async () => {
  const token = await signToken();

  const response = await request(app.getHttpServer())
    .post(route)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'auth-test-valid')
    .send(body)
    .expect(503);

  assert.equal(response.body.error.code, 'PERSISTENCE_NOT_CONFIGURED');
});
