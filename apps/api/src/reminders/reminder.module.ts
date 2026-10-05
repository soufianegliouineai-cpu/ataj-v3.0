import { Module } from '@nestjs/common';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';
import { ReminderController } from './reminder.controller.js';
import { ReminderSchedulerService } from './reminder-scheduler.service.js';
import { ReminderService } from './reminder.service.js';

@Module({
  controllers: [ReminderController],
  providers: [ReminderService, ReminderSchedulerService, NotificationDispatcherService],
  exports: [ReminderService, ReminderSchedulerService, NotificationDispatcherService],
})
export class ReminderModule {}
