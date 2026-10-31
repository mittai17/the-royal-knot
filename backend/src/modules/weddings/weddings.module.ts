import { Module } from '@nestjs/common';
import { WeddingsController } from './weddings.controller';
import { WeddingsService } from './weddings.service';

@Module({ controllers: [WeddingsController], providers: [WeddingsService], exports: [WeddingsService] })
export class WeddingsModule {}
