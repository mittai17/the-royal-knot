import { Module } from '@nestjs/common';
import { ClientFeedbackController, FeedbackController, VendorSupportController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({ controllers: [FeedbackController, ClientFeedbackController, VendorSupportController], providers: [FeedbackService], exports: [FeedbackService] })
export class FeedbackModule {}
