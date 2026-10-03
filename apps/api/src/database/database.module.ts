import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

@Global()
@Module({
  providers: [DatabaseService, WorkerDatabaseService],
  exports: [DatabaseService, WorkerDatabaseService],
})
export class DatabaseModule {}
