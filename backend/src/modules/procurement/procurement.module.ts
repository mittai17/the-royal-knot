import { Module } from '@nestjs/common';
import { QuotationsModule } from '../quotations/quotations.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({ imports: [QuotationsModule], controllers: [ProcurementController], providers: [ProcurementService], exports: [ProcurementService] })
export class ProcurementModule {}
