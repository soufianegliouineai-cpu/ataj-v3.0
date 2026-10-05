import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ReminderSchedulerService } from './reminders/reminder-scheduler.service.js';

const pollMs = parsePositiveInt(process.env.SCHEDULER_POLL_INTERVAL_MS, 60_000);
const once = process.env.SCHEDULER_ONCE === 'true';
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
  const scheduler = app.get(ReminderSchedulerService);

  if (!scheduler.configured) {
    throw new Error('LifeOS reminder scheduler is not configured.');
  }

  do {
    await scheduler.runOnce();
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
