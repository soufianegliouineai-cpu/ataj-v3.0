import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentProcessingWorkerService } from './processing/document-processing-worker.service.js';

const pollMs = parsePositiveInt(process.env.WORKER_POLL_INTERVAL_MS, 1000);
const once = process.env.WORKER_ONCE === 'true';
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});

try {
  const worker = app.get(DocumentProcessingWorkerService);

  if (!worker.configured) {
    throw new Error('LifeOS processing worker is not fully configured.');
  }

  do {
    const result = await worker.runOnce();

    if (once) break;
    if (!result.claimed && !stopping) {
      await sleep(pollMs);
    }
  } while (!stopping);
} finally {
  await app.close();
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
