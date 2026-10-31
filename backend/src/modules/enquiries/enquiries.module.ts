import { Module } from '@nestjs/common';
import { WeddingsModule } from '../weddings/weddings.module';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';

@Module({ imports: [WeddingsModule], controllers: [EnquiriesController], providers: [EnquiriesService] })
export class EnquiriesModule {}
