import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { LIFEOS_API_VERSION } from './constants.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';

type LifeOSRequest = Request & { lifeosRequestId?: string };

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('v1');

  app.use((req: LifeOSRequest, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    req.lifeosRequestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-LifeOS-Version', LIFEOS_API_VERSION);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: errors.map((error) => ({
        field: error.property,
        constraints: error.constraints ?? {},
      })),
    }),
  }));

  app.useGlobalFilters(new ApiExceptionFilter());

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'idempotency-key', 'x-request-id', 'authorization'],
    exposedHeaders: ['x-request-id', 'x-lifeos-version'],
  });

  app.enableShutdownHooks();
}
