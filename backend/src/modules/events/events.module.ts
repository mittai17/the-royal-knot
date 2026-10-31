import { Module } from '@nestjs/common';
import { EventOpsController } from './event-ops.controller';
import { EventOpsService } from './event-ops.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({ controllers: [EventsController, EventOpsController], providers: [EventsService, EventOpsService], exports: [EventsService] })
export class EventsModule {}
