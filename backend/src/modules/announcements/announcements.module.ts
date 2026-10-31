import { Module } from '@nestjs/common';
import { AnnouncementsController, ClientAnnouncementsController, VendorAnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({ controllers: [AnnouncementsController, ClientAnnouncementsController, VendorAnnouncementsController], providers: [AnnouncementsService], exports: [AnnouncementsService] })
export class AnnouncementsModule {}
