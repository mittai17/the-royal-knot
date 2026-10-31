import { Module } from '@nestjs/common';
import { ClientChatController, MessagingController, VendorMessagesController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({ controllers: [MessagingController, ClientChatController, VendorMessagesController], providers: [MessagingService], exports: [MessagingService] })
export class MessagingModule {}
