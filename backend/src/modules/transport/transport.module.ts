import { Module } from '@nestjs/common';
import { ClientTransportController, TransportController } from './transport.controller';
import { TransportService } from './transport.service';

@Module({ controllers: [TransportController, ClientTransportController], providers: [TransportService], exports: [TransportService] })
export class TransportModule {}
