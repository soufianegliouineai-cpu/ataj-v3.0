import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type LifeOSRequest = Request & { lifeosRequestId?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<LifeOSRequest>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw = exception instanceof HttpException
      ? exception.getResponse()
      : null;

    const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const code = typeof body.code === 'string'
      ? body.code
      : status === 404
        ? 'NOT_FOUND'
        : status >= 500
          ? 'INTERNAL_ERROR'
          : 'HTTP_ERROR';

    const message = typeof body.message === 'string'
      ? body.message
      : exception instanceof Error && status >= 500
        ? 'Internal server error.'
        : 'Request failed.';

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
