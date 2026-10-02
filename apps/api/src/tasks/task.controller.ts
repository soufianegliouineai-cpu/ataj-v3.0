import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthGuard,
  type AuthenticatedLifeOSRequest,
} from '../auth/oidc-auth.guard.js';
import { LIFEOS_API_VERSION } from '../constants.js';
import { TaskService } from './task.service.js';

@Controller('households/:householdId/tasks')
@UseGuards(OidcAuthGuard)
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post(':taskId/complete')
  @HttpCode(200)
  async complete(
    @Param('householdId', new ParseUUIDPipe()) householdId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Req() request: AuthenticatedLifeOSRequest,
  ) {
    if (!this.tasks.enabled) {
      throw new ServiceUnavailableException({
        code: 'PERSISTENCE_NOT_CONFIGURED',
        message: 'Persistent LifeOS storage is not configured for this deployment.',
      });
    }

    const identity = request.lifeosIdentity;
    if (!identity) {
      throw new ServiceUnavailableException({
        code: 'AUTH_CONTEXT_MISSING',
        message: 'Verified identity context is unavailable.',
      });
    }

    return {
      data: await this.tasks.complete(
        identity.userId,
        householdId,
        taskId,
        request.lifeosRequestId ?? 'unknown',
      ),
      meta: {
        requestId: request.lifeosRequestId ?? 'unknown',
        version: LIFEOS_API_VERSION,
      },
    };
  }
}
