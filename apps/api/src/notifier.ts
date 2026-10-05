import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { NotificationDispatcherService } from './reminders/notification-dispatcher.service.js';

const pollMs = parsePositiveInt(process.env.NOTIFICATION_POLL_INTERVAL_MS, 15_000);
const once = process.env.NOTIFICATION_ONCE === 'true';
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
  const dispatcher = app.get(NotificationDispatcherService);
  if (!dispatcher.configured) {
    throw new Error('LifeOS notification dispatcher is not configured.');
  }

  do {
    await dispatcher.runOnce();
    if (once || stopping) break;
    await sleep(pollMs);
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
