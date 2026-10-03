from pathlib import Path


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'migration anchor missing: {label}')


test_path = Path('apps/api/test/http.integration.test.ts')
text = test_path.read_text()

text = require_replace(
    text,
    "import { configureApp } from '../src/configure-app.js';\n",
    "import { configureApp } from '../src/configure-app.js';\nimport { DocumentProcessingWorkerService } from '../src/processing/document-processing-worker.service.js';\n",
    'worker import',
)

text = require_replace(
    text,
    "let lastOcrRequestSha256: string | null = null;\n",
    "let lastOcrRequestSha256: string | null = null;\nlet processingWorker: DocumentProcessingWorkerService;\n",
    'worker variable',
)

text = require_replace(
    text,
    "  configureApp(app);\n  await app.init();\n",
    "  configureApp(app);\n  await app.init();\n  processingWorker = app.get(DocumentProcessingWorkerService);\n",
    'worker initialization',
)

text = require_replace(
    text,
    "  assert.equal(readiness.body.capabilities.documentProcessing, 'ready');\n",
    "  assert.equal(readiness.body.capabilities.documentProcessing, 'ready');\n  assert.equal(readiness.body.capabilities.processingQueue, 'ready');\n  assert.equal(readiness.body.capabilities.processingWorker, 'ready');\n",
    'readiness assertions',
)

old_processing = """  const processed = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(processed.body.data.status, 'succeeded');
  assert.equal(processed.body.data.replayed, false);
  assert.equal(processed.body.data.sourceIntegrity.sha256, uploadSha256);
  assert.equal(processed.body.data.sourceIntegrity.sizeBytes, uploadBytes.length);
  assert.equal(processed.body.data.sourceIntegrity.reverifiedBeforeOcr, true);
  assert.equal(processed.body.data.engine.provider, 'azure_document_intelligence');
  assert.equal(processed.body.data.engine.modelName, 'prebuilt-idDocument');
  assert.equal(processed.body.data.engine.apiVersion, '2024-11-30');
  assert.equal(processed.body.data.fieldCount, 2);
  assert.equal(lastOcrRequestSha256, uploadSha256);
  assert.ok(ocrPollCount >= 2);

  const extractionRunId = processed.body.data.extractionRunId as string;
  assert.match(extractionRunId, /^[0-9a-f-]{36}$/i);
"""

new_processing = """  const queued = await request(app.getHttpServer())
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
"""
text = require_replace(text, old_processing, new_processing, 'async processing flow')

old_replay = """  const processingReplay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);

  assert.equal(processingReplay.body.data.replayed, true);
  assert.equal(processingReplay.body.data.extractionRunId, extractionRunId);
"""
new_replay = """  const processingReplay = await request(app.getHttpServer())
    .post(`/v1/households/${householdId}/uploads/${uploadIntent.body.data.id}/process`)
    .set('Authorization', `Bearer ${token}`)
    .expect(202);

  assert.equal(processingReplay.body.data.replayed, true);
  assert.equal(processingReplay.body.data.status, 'succeeded');
  assert.equal(processingReplay.body.data.extractionRunId, extractionRunId);
"""
text = require_replace(text, old_replay, new_replay, 'processing replay')

test_path.write_text(text)

workflow_path = Path('.github/workflows/lifeos-production.yml')
flow = workflow_path.read_text()
flow = require_replace(
    flow,
    '          MALWARE_SCAN_MAX_BYTES: "26214400"\n        run: npm run test:integration --prefix apps/api\n',
    '          MALWARE_SCAN_MAX_BYTES: "26214400"\n          PGPASSWORD: postgres\n        run: |\n          export WORKER_DATABASE_URL="postgresql://postgres:${PGPASSWORD}@127.0.0.1:5432/lifeos_ci"\n          npm run test:integration --prefix apps/api\n',
    'worker database CI environment',
)
workflow_path.write_text(flow)
