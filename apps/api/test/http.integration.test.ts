import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { DocumentProcessingWorkerService } from '../src/processing/document-processing-worker.service.js';
import { DocumentProcessingWorkerService } from '../src/processing/document-processing-worker.service.js';

const enabled = Boolean(process.env.DATABASE_URL);
const issuer = 'https://integration.issuer.lifeos.test';
const audience = 'lifeos-api';
const ownerId = '00000000-0000-4000-8000-000000000201';
const outsiderId = '00000000-0000-4000-8000-000000000202';
const extractionReviewOwnerId = '00000000-0000-4000-8000-000000000213';
const extractionReviewHouseholdId = '10000000-0000-4000-8000-000000000213';
const extractionReviewRunId = '50000000-0000-4000-8000-000000000213';
const extractionReviewFieldId = '60000000-0000-4000-8000-000000000213';

let app: INestApplication;
let server: Server;
let privateKey: CryptoKey;
let jwk: JWK;
let integrationBaseUrl = '';
let ocrPollCount = 0;
let lastOcrRequestSha256: string | null = null;
let processingWorker: DocumentProcessingWorkerService;
let processingWorker: DocumentProcessingWorkerService;

before(async () => {
  if (!enabled) return;

  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'lifeos-integration-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/jwks') {
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
      });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    if (
      req.method === 'POST'
      && url.pathname === '/documentintelligence/documentModels/prebuilt-idDocument:analyze'
      && url.searchParams.get('api-version') === '2024-11-30'
    ) {
      if (req.headers['ocp-apim-subscription-key'] !== 'integration-ocr-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'Unauthorized' } }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const value of req) {
        chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
      }
      const body = Buffer.concat(chunks);
      lastOcrRequestSha256 = createHash('sha256').update(body).digest('hex');
      ocrPollCount = 0;

      res.writeHead(202, {
        'operation-location': `${integrationBaseUrl}/ocr/operations/integration-1`,
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ocr/operations/integration-1') {
      if (req.headers['ocp-apim-subscription-key'] !== 'integration-ocr-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'Unauthorized' } }));
        return;
      }

      ocrPollCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });

      if (ocrPollCount === 1) {
        res.end(JSON.stringify({ status: 'running' }));
        return;
      }

      res.end(JSON.stringify({
        status: 'succeeded',
        analyzeResult: {
          apiVersion: '2024-11-30',
          modelId: 'prebuilt-idDocument',
          pages: [{ pageNumber: 1 }],
          documents: [{
            fields: {
              DateOfExpiration: {
                type: 'date',
                content: '2030-12-31',
                valueDate: '2030-12-31',
                confidence: 0.9876,
                boundingRegions: [{
                  pageNumber: 1,
                  polygon: [0.61, 0.72, 0.83, 0.72, 0.83, 0.76, 0.61, 0.76],
                }],
              },
              DocumentNumber: {
                type: 'string',
                content: 'MA123456',
                valueString: 'MA123456',
                confidence: 0.9654,
                boundingRegions: [{
                  pageNumber: 1,
                  polygon: [0.15, 0.25, 0.31, 0.25, 0.31, 0.29, 0.15, 0.29],
                }],
              },
            },
          }],
        },
      }));
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  integrationBaseUrl = `http://127.0.0.1:${address.port}`;

  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_AUDIENCE = audience;
  process.env.OIDC_JWKS_URL = `${integrationBaseUrl}/jwks`;
  process.env.OIDC_ALLOWED_ALGS = 'RS256';
  process.env.OIDC_USER_ID_CLAIM = 'sub';

  process.env.OCR_PROVIDER = 'azure_document_intelligence';
  process.env.OCR_AUTH_MODE = 'api_key';
  process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = integrationBaseUrl;
  process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'integration-ocr-key';
  process.env.OCR_ALLOW_HTTP = 'true';
  process.env.OCR_POLL_INTERVAL_MS = '10';
  process.env.OCR_TIMEOUT_MS = '5000';

  if (!process.env.WORKER_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.WORKER_DATABASE_URL = process.env.DATABASE_URL;
  }

  if (!process.env.WORKER_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.WORKER_DATABASE_URL = process.env.DATABASE_URL;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  processingWorker = app.get(DocumentProcessingWorkerService);
  processingWorker = app.get(DocumentProcessingWorkerService);
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
  delete process.env.OCR_PROVIDER;
  delete process.env.OCR_AUTH_MODE;
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  delete process.env.OCR_ALLOW_HTTP;
  delete process.env.OCR_POLL_INTERVAL_MS;
  delete process.env.OCR_TIMEOUT_MS;
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
  assert.equal(readiness.body.capabilities.byteTransport, 'ready');
  assert.equal(readiness.body.capabilities.malwareScanning, 'ready');
  assert.equal(readiness.body.capabilities.ocrExtraction, 'ready');
  assert.equal(readiness.body.capabilities.documentProcessing, 'ready');
  assert.equal(readiness.body.capabilities.processingQueue, 'ready');
  assert.equal(readiness.body.capabilities.processingWorker, 'ready');
  assert.equal(readiness.body.capabilities.processingQueue, 'ready');
  assert.equal(readiness.body.capabilities.processingWorker, 'ready');

  const created = await request(app.getHttpServer())
    .post('/v1/households')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'HTTP Integration Household', homeJurisdiction: 'MA' })
    .expect(201);

  const householdId = created.body.data.id as string;
  assert.match(householdId, /^[0-9a-f-]{36}$/i);
  assert.equal(created.body.data.role, 'owner');
  assert.equal(created.body.data.homeJurisdiction, 'MA');

  const households = await request(app.getHttpServer())
    .get('/v1/households')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.ok(
    households.body.data.some((item: { id: string; role: string }) =>
      item.id === householdId && item.role === 'owner'
    ),
  );

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

  const uploadBytes = Buffer.alloc(1024, 0x25);
  const uploadSha256 = createHash('sha256').update(uploadBytes).digest('hex');

  const uploadIntent = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: uploadBytes.length,
      documentType: 'passport',
      personId,
      sha256: uploadSha256,
    })
    .expect(201);

  assert.match(uploadIntent.body.data.id, /^[0-9a-f-]{36}$/i);
  assert.equal(uploadIntent.body.data.quarantine.status, 'uploading');
  assert.equal(uploadIntent.body.data.quarantine.malwareStatus, 'pending');
  assert.equal(uploadIntent.body.data.storage.configured, true);
  assert.equal(uploadIntent.body.data.storage.provider, 'azure_blob');
  assert.equal(uploadIntent.body.data.storage.authorization, 'shared_key_sas');
  assert.match(uploadIntent.body.data.storage.uploadUrl, /^http:\/\/127\.0\.0\.1:10000\/devstoreaccount1\//);
  assert.equal(uploadIntent.body.data.storage.requiredHeaders['x-ms-blob-type'], 'BlockBlob');
  assert.equal(uploadIntent.body.data.storage.requiredHeaders['Content-Type'], 'application/pdf');
  assert.ok(Date.parse(uploadIntent.body.data.storage.expiresAt) > Date.now());
  assert.equal(uploadIntent.body.data.file.declaredSha256, uploadSha256);
  assert.equal(uploadIntent.body.data.file.hashVerification, 'pending');
  assert.equal(uploadIntent.body.meta.byteTransportConfigured, true);

  const putResponse = await fetch(uploadIntent.body.data.storage.uploadUrl, {
    method: 'PUT',
    headers: uploadIntent.body.data.storage.requiredHeaders,
    body: uploadBytes,
  });
  assert.equal(putResponse.status, 201);

  const readAttempt = await fetch(uploadIntent.body.data.storage.uploadUrl);
  assert.equal(readAttempt.status, 403, 'upload SAS must not grant read permission');

  const finalizedUpload = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/finalize`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(finalizedUpload.body.data.status, 'quarantined');
  assert.equal(finalizedUpload.body.data.quarantine.malwareStatus, 'pending');
  assert.equal(finalizedUpload.body.data.quarantine.requiredBeforeProcessing, true);
  assert.equal(finalizedUpload.body.data.file.sizeBytes, uploadBytes.length);
  assert.equal(finalizedUpload.body.data.file.hashVerification, 'pending_scan');
  assert.equal(finalizedUpload.body.data.storage.provider, 'azure_blob');
  assert.ok(finalizedUpload.body.data.storage.etag);
  assert.equal(finalizedUpload.body.meta.byteTransportConfigured, true);

  const scannedUpload = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/scan`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(scannedUpload.body.data.status, 'clean');
  assert.equal(scannedUpload.body.data.malwareStatus, 'clean');
  assert.equal(scannedUpload.body.data.actualSha256, uploadSha256);
  assert.equal(scannedUpload.body.data.sizeBytes, uploadBytes.length);
  assert.equal(scannedUpload.body.data.signature, null);
  assert.equal(scannedUpload.body.data.replayed, false);
  assert.equal(scannedUpload.body.meta.malwareScannerConfigured, true);

  const scanReplay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/scan`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(scanReplay.body.data.replayed, true);
  assert.equal(scanReplay.body.data.status, 'clean');
  assert.equal(scanReplay.body.data.actualSha256, uploadSha256);

  const queued = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(202);

  assert.equal(queued.body.data.status, 'queued');
  assert.equal(queued.body.data.replayed, false);
  assert.equal(queued.body.data.attemptCount, 0);
  assert.equal(queued.body.meta.execution, 'durable_postgres_queue');

  const queuedStatus = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(queuedStatus.body.data.status, 'queued');
  assert.equal(queuedStatus.body.data.extractionRunId, null);

  const workerResult = await processingWorker.runOnce();
  assert.equal(workerResult.claimed, true);
  assert.equal(workerResult.status, 'succeeded');
  if (!workerResult.claimed || workerResult.status !== 'succeeded') {
    throw new Error('Durable processing worker did not succeed.');
  }
  assert.equal(workerResult.sourceIntegrity.sha256, uploadSha256);
  assert.equal(workerResult.sourceIntegrity.sizeBytes, uploadBytes.length);
  assert.equal(workerResult.sourceIntegrity.reverifiedBeforeOcr, true);
  assert.equal(workerResult.engine.provider, 'azure_document_intelligence');
  assert.equal(workerResult.engine.modelName, 'prebuilt-idDocument');
  assert.equal(workerResult.engine.apiVersion, '2024-11-30');
  assert.equal(workerResult.fieldCount, 2);
  assert.equal(lastOcrRequestSha256, uploadSha256);
  assert.ok(ocrPollCount >= 2);

  const processed = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(processed.body.data.status, 'succeeded');
  assert.equal(processed.body.data.attemptCount, 1);
  assert.equal(processed.body.meta.execution, 'durable_postgres_queue');

  const extractionRunId = processed.body.data.extractionRunId as string;
  assert.match(extractionRunId, /^[0-9a-f-]{36}$/i);

  const extraction = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/extractions/${extractionRunId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(extraction.body.data.status, 'succeeded');
  assert.equal(extraction.body.data.sourceIntegrity.sha256, uploadSha256);
  assert.equal(extraction.body.data.engine.provider, 'azure_document_intelligence');
  assert.equal(extraction.body.data.engine.modelName, 'prebuilt-idDocument');
  assert.equal(extraction.body.data.pageCount, 1);

  const expiryField = extraction.body.data.fields.find(
    (field: { key: string }) => field.key === 'expiry_date',
  );
  assert.ok(expiryField);
  assert.equal(expiryField.value, '2030-12-31');
  assert.equal(expiryField.normalizedValue, '2030-12-31');
  assert.equal(expiryField.trustClass, 'AI_EXTRACTED');
  assert.equal(expiryField.reviewStatus, 'pending');
  assert.equal(expiryField.provenance.page, 1);
  assert.ok(expiryField.provenance.sourceTextHash);

  const confirmedExpiry = await request(app.getHttpServer())
    .post(
      `/v1/households/${householdId}/extractions/${extractionRunId}/fields/${expiryField.id}/confirm`,
    )
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(confirmedExpiry.body.data.trustClass, 'USER_CONFIRMED');
  assert.equal(confirmedExpiry.body.data.fieldKey, 'expiry_date');
  assert.equal(confirmedExpiry.body.data.normalizedValue, '2030-12-31');
  assert.equal(confirmedExpiry.body.data.provenance.sourceOrigin, 'ai_extracted');
  assert.equal(confirmedExpiry.body.data.provenance.sourceSha256, uploadSha256);
  assert.equal(confirmedExpiry.body.data.protection.dueAt, '2030-12-31');
  assert.equal(confirmedExpiry.body.data.protection.recommendedActionAt, '2030-10-02');
  assert.equal(confirmedExpiry.body.data.protection.rule.code, 'generic_expiry_protection_v1');
  assert.equal(confirmedExpiry.body.data.protection.rule.deterministic, true);
  assert.equal(confirmedExpiry.body.data.protection.rule.jurisdictional, false);
  assert.equal(confirmedExpiry.body.data.protection.rule.legalRuleApplied, false);
  assert.match(confirmedExpiry.body.data.protection.obligationId, /^[0-9a-f-]{36}$/i);
  assert.match(confirmedExpiry.body.data.protection.deadlineId, /^[0-9a-f-]{36}$/i);
  assert.match(confirmedExpiry.body.data.protection.taskId, /^[0-9a-f-]{36}$/i);

  const confirmationReplay = await request(app.getHttpServer())
    .post(
      `/v1/households/${householdId}/extractions/${extractionRunId}/fields/${expiryField.id}/confirm`,
    )
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(confirmationReplay.body.data.replayed, true);
  assert.equal(
    confirmationReplay.body.data.protection.obligationId,
    confirmedExpiry.body.data.protection.obligationId,
  );
  assert.equal(
    confirmationReplay.body.data.protection.deadlineId,
    confirmedExpiry.body.data.protection.deadlineId,
  );
  assert.equal(
    confirmationReplay.body.data.protection.taskId,
    confirmedExpiry.body.data.protection.taskId,
  );

  const protectedTimeline = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/timeline`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const extractedProtection = protectedTimeline.body.data.items.find(
    (item: { obligation: { id: string } }) =>
      item.obligation.id === confirmedExpiry.body.data.protection.obligationId,
  );
  assert.ok(extractedProtection);
  assert.equal(extractedProtection.deadline.dueAt, '2030-12-31');
  assert.equal(extractedProtection.deadline.recommendedActionAt, '2030-10-02');
  assert.equal(extractedProtection.obligation.type, 'EXPIRY_PROTECTION');
  assert.equal(extractedProtection.document.id, confirmedExpiry.body.data.documentId);
  assert.equal(extractedProtection.task.id, confirmedExpiry.body.data.protection.taskId);

  const processingReplay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(202);

  assert.equal(processingReplay.body.data.replayed, true);
  assert.equal(processingReplay.body.data.status, 'succeeded');
  assert.equal(processingReplay.body.data.extractionRunId, extractionRunId);

  const eicarBytes = Buffer.from([
    'X5O!P%@AP[4',
    '\\PZX54(P^)7CC)7}$EICAR-',
    'STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
  ].join(''), 'ascii');
  assert.equal(eicarBytes.length, 68);
  const eicarSha256 = createHash('sha256').update(eicarBytes).digest('hex');

  const infectedIntent = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'scanner-check.pdf',
      mimeType: 'application/pdf',
      sizeBytes: eicarBytes.length,
      documentType: 'other',
      sha256: eicarSha256,
    })
    .expect(201);

  const infectedPut = await fetch(infectedIntent.body.data.storage.uploadUrl, {
    method: 'PUT',
    headers: infectedIntent.body.data.storage.requiredHeaders,
    body: eicarBytes,
  });
  assert.equal(infectedPut.status, 201);

  await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${infectedIntent.body.data.id}/finalize`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  const malwareRejected = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${infectedIntent.body.data.id}/scan`)
    .set('Authorization', `Bearer ${token}`)
    .expect(409);

  assert.equal(malwareRejected.body.error.code, 'MALWARE_DETECTED');
  assert.ok(malwareRejected.body.error.details.signature);

  const uploads = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/uploads`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const cleanUpload = uploads.body.data.find(
    (item: { id: string }) => item.id === uploadIntent.body.data.id,
  );
  assert.ok(cleanUpload);
  assert.equal(cleanUpload.quarantine.status, 'processed');
  assert.equal(cleanUpload.quarantine.malwareStatus, 'clean');
  assert.equal(cleanUpload.file.actualSha256, uploadSha256);

  const infectedUpload = uploads.body.data.find(
    (item: { id: string }) => item.id === infectedIntent.body.data.id,
  );
  assert.ok(infectedUpload);
  assert.equal(infectedUpload.quarantine.status, 'rejected');
  assert.equal(infectedUpload.quarantine.malwareStatus, 'infected');
  assert.equal(infectedUpload.file.actualSha256, eicarSha256);

  const invalidMime = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'archive.zip',
      mimeType: 'application/zip',
      sizeBytes: 1024,
      documentType: 'other',
    })
    .expect(400);
  assert.equal(invalidMime.body.error.code, 'VALIDATION_ERROR');

  const oversized = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 26_214_401,
      documentType: 'other',
    })
    .expect(400);
  assert.equal(oversized.body.error.code, 'VALIDATION_ERROR');

  const unsafeFilename = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: '../passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'passport',
    })
    .expect(400);
  assert.equal(unsafeFilename.body.error.code, 'VALIDATION_ERROR');

  const blankFilename = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: '   ',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'passport',
    })
    .expect(400);
  assert.equal(blankFilename.body.error.code, 'VALIDATION_ERROR');

  const dotFilename = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: '..',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'passport',
    })
    .expect(400);
  assert.equal(dotFilename.body.error.code, 'VALIDATION_ERROR');

    const badHash = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'passport',
      sha256: 'not-a-sha256',
    })
    .expect(400);
  assert.equal(badHash.body.error.code, 'VALIDATION_ERROR');

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

  const homeBeforeCompletion = await request(app.getHttpServer())
    .get('/v1/home')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(homeBeforeCompletion.body.data.counts.households, 1);
  assert.equal(homeBeforeCompletion.body.data.coverage.identity, 'protected');
  assert.equal(homeBeforeCompletion.body.data.nextAction.taskId, first.body.data.persistence.taskId);
  assert.equal(homeBeforeCompletion.body.data.status.state, 'upcoming');

  const replay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/protection/expiry`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'http-integration-protect-001')
    .send(body)
    .expect(201);

  assert.equal(replay.body.meta.replayed, true);
  assert.deepEqual(replay.body.data.persistence, first.body.data.persistence);

  const timeline = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/timeline`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(timeline.body.data.household.id, householdId);
  assert.ok(timeline.body.data.items.length >= 1);
  const timelineItem = timeline.body.data.items.find(
    (item: { deadline: { id: string } }) =>
      item.deadline.id === first.body.data.persistence.deadlineId,
  );
  assert.ok(timelineItem);
  assert.equal(timelineItem.document.id, first.body.data.persistence.documentId);
  assert.equal(timelineItem.obligation.id, first.body.data.persistence.obligationId);
  assert.equal(timelineItem.task.id, first.body.data.persistence.taskId);
  assert.equal(timelineItem.deadline.dueAt, '2028-12-31');

  const completed = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/tasks/${first.body.data.persistence.taskId}/complete`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(completed.body.data.status, 'completed');
  assert.equal(completed.body.data.deadlineStatus, 'completed');
  assert.equal(completed.body.data.obligationStatus, 'completed');
  assert.equal(completed.body.data.replayed, false);
  assert.ok(completed.body.data.completedAt);

  const completionReplay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/tasks/${first.body.data.persistence.taskId}/complete`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(completionReplay.body.data.replayed, true);
  assert.equal(completionReplay.body.data.completedAt, completed.body.data.completedAt);

  const completedTimeline = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/timeline`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const completedItem = completedTimeline.body.data.items.find(
    (item: { task: { id: string } | null }) =>
      item.task?.id === first.body.data.persistence.taskId,
  );
  assert.ok(completedItem);
  assert.equal(completedItem.task.status, 'completed');
  assert.equal(completedItem.deadline.status, 'completed');
  assert.equal(completedItem.obligation.status, 'completed');

  const homeAfterCompletion = await request(app.getHttpServer())
    .get('/v1/home')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(
    homeAfterCompletion.body.data.nextAction.taskId,
    confirmedExpiry.body.data.protection.taskId,
  );
  assert.equal(homeAfterCompletion.body.data.nextAction.recommendedActionAt, '2030-10-02');
  assert.ok(homeAfterCompletion.body.data.upcoming.length >= 1);
  assert.equal(homeAfterCompletion.body.data.counts.completedObligations, 1);
  assert.ok(homeAfterCompletion.body.data.counts.activeObligations >= 1);
  assert.equal(homeAfterCompletion.body.data.status.state, 'upcoming');

  const outsiderToken = await signToken(outsiderId);
  const denied = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/protection/expiry`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .set('Idempotency-Key', 'http-integration-outsider-001')
    .send(body)
    .expect(404);

  assert.equal(denied.body.error.code, 'HOUSEHOLD_NOT_FOUND');

  const outsiderUpload = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/intents`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .send({
      fileName: 'stolen.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      documentType: 'other',
    })
    .expect(404);
  assert.equal(outsiderUpload.body.error.code, 'HOUSEHOLD_NOT_FOUND');

  const outsiderUploads = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/uploads`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);
  assert.equal(outsiderUploads.body.error.code, 'HOUSEHOLD_NOT_FOUND');

    const outsiderHouseholds = await request(app.getHttpServer())
    .get('/v1/households')
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(200);
  assert.deepEqual(outsiderHouseholds.body.data, []);

  const outsiderHome = await request(app.getHttpServer())
    .get('/v1/home')
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(200);
  assert.equal(outsiderHome.body.data.counts.households, 0);
  assert.equal(outsiderHome.body.data.nextAction, null);
  assert.deepEqual(outsiderHome.body.data.upcoming, []);

  const outsiderTimeline = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/timeline`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);
  assert.equal(outsiderTimeline.body.error.code, 'HOUSEHOLD_NOT_FOUND');

  const outsiderCompleteTask = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/tasks/${first.body.data.persistence.taskId}/complete`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);
  assert.equal(outsiderCompleteTask.body.error.code, 'TASK_NOT_FOUND');

  const hiddenPeople = await request(app.getHttpServer())
    .get(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);

  assert.equal(hiddenPeople.body.error.code, 'HOUSEHOLD_NOT_FOUND');

  const deniedPerson = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/people`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .send({ displayName: 'Unauthorized Person', relationship: 'other' })
    .expect(404);

  assert.equal(deniedPerson.body.error.code, 'HOUSEHOLD_NOT_FOUND');

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

  const crossHouseholdUpload = await request(app.getHttpServer())
    .post(`/v1/households/${secondHousehold.body.data.id}/uploads/intents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'cross.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'passport',
      personId,
    })
    .expect(404);
  assert.equal(crossHouseholdUpload.body.error.code, 'PERSON_NOT_FOUND');
});

test('explicit extraction review promotes one trusted fact with immutable provenance', { skip: !enabled }, async () => {
  const token = await signToken(extractionReviewOwnerId);
  const outsiderToken = await signToken(outsiderId);

  const before = await request(app.getHttpServer())
    .get(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(before.body.data.status, 'succeeded');
  assert.equal(before.body.data.engine.provider, 'custom');
  assert.equal(before.body.data.engine.modelName, 'ci-fixture-extractor');
  assert.equal(before.body.data.sourceIntegrity.sha256, '2'.repeat(64));

  const field = before.body.data.fields.find(
    (item: { id: string }) => item.id === extractionReviewFieldId,
  );
  assert.ok(field);
  assert.equal(field.trustClass, 'AI_EXTRACTED');
  assert.equal(field.reviewStatus, 'pending');
  assert.equal(field.reviewRequired, true);
  assert.equal(field.originalConfidence, 0.9821);
  assert.equal(field.provenance.page, 1);

  const hidden = await request(app.getHttpServer())
    .get(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);
  assert.equal(hidden.body.error.code, 'HOUSEHOLD_NOT_FOUND');

  const confirmed = await request(app.getHttpServer())
    .post(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}/fields/${extractionReviewFieldId}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(confirmed.body.data.replayed, false);
  assert.equal(confirmed.body.data.trustClass, 'USER_CONFIRMED');
  assert.ok(confirmed.body.data.documentId);
  assert.ok(confirmed.body.data.factId);
  assert.equal(confirmed.body.data.fieldKey, 'expiry_date');
  assert.equal(confirmed.body.data.normalizedValue, '2029-12-31');
  assert.equal(confirmed.body.data.provenance.sourceOrigin, 'ai_extracted');
  assert.equal(confirmed.body.data.provenance.originalConfidence, 0.9821);
  assert.equal(confirmed.body.data.provenance.page, 1);
  assert.equal(confirmed.body.data.provenance.sourceSha256, '2'.repeat(64));
  assert.equal(confirmed.body.data.provenance.modelName, 'ci-fixture-extractor');

  const replay = await request(app.getHttpServer())
    .post(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}/fields/${extractionReviewFieldId}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(replay.body.data.replayed, true);
  assert.equal(replay.body.data.documentId, confirmed.body.data.documentId);
  assert.equal(replay.body.data.factId, confirmed.body.data.factId);

  const after = await request(app.getHttpServer())
    .get(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const reviewed = after.body.data.fields.find(
    (item: { id: string }) => item.id === extractionReviewFieldId,
  );
  assert.equal(reviewed.reviewStatus, 'confirmed');
  assert.equal(reviewed.reviewRequired, false);

  const outsiderConfirm = await request(app.getHttpServer())
    .post(`/v1/households/${extractionReviewHouseholdId}/extractions/${extractionReviewRunId}/fields/${extractionReviewFieldId}/confirm`)
    .set('Authorization', `Bearer ${outsiderToken}`)
    .expect(404);
  assert.equal(outsiderConfirm.body.error.code, 'HOUSEHOLD_NOT_FOUND');
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
