import { Module } from '@nestjs/common';
import { AccommodationController, ClientAccommodationController } from './accommodation.controller';
import { AccommodationService } from './accommodation.service';

@Module({ controllers: [AccommodationController, ClientAccommodationController], providers: [AccommodationService], exports: [AccommodationService] })
export class AccommodationModule {}
