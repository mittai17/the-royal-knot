import { Module } from '@nestjs/common';
import { ChecklistsController, ClientChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({ controllers: [ChecklistsController, ClientChecklistsController], providers: [ChecklistsService], exports: [ChecklistsService] })
export class ChecklistsModule {}
