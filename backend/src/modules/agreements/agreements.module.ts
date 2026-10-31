import { Module } from '@nestjs/common';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({ controllers: [AgreementsController], providers: [AgreementsService], exports: [AgreementsService] })
export class AgreementsModule {}
