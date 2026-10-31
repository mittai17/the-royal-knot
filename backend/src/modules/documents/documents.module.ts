import { Global, Module } from '@nestjs/common';
import { PdfService } from '../../common/pdf.service';
import { StorageService } from '../../common/storage.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Global() @Module({ controllers: [DocumentsController], providers: [DocumentsService, StorageService, PdfService], exports: [DocumentsService, StorageService, PdfService] })
export class DocumentsModule {}
