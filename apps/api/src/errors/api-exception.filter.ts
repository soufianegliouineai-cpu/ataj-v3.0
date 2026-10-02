import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type LifeOSRequest = Request & { lifeosRequestId?: string };
type DatabaseError = Error & { code?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<LifeOSRequest>();
    const response = http.getResponse<Response>();

    const database = mapDatabaseError(exception);
    const status = database?.status ?? (
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR
    );

    const raw = exception instanceof HttpException
      ? exception.getResponse()
      : null;

    const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const code = database?.code ?? (
      typeof body.code === 'string'
        ? body.code
        : status === 404
          ? 'NOT_FOUND'
          : status >= 500
            ? 'INTERNAL_ERROR'
            : 'HTTP_ERROR'
    );

    const message = database?.message ?? (
      typeof body.message === 'string'
        ? body.message
        : status >= 500
          ? 'Internal server error.'
          : 'Request failed.'
    );

    response.status(status).json({
      error: {
        code,
        message,
        ...(body.details === undefined ? {} : { details: body.details }),
      },
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
      },
    });
  }
}

function mapDatabaseError(exception: unknown) {
  if (!(exception instanceof Error)) return null;

  const code = (exception as DatabaseError).code
    ?? ((exception as Error & { cause?: DatabaseError }).cause?.code);

  switch (code) {
    case '42501':
      return {
        status: HttpStatus.FORBIDDEN,
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to access or modify this resource.',
      };
    case '23505':
      return {
        status: HttpStatus.CONFLICT,
        code: 'RESOURCE_CONFLICT',
        message: 'The requested change conflicts with an existing resource.',
      };
    case '23514':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_STATE',
        message: 'The requested data violates a LifeOS data constraint.',
      };
    default:
      return null;
  }
}
