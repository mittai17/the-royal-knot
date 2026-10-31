import { Module } from '@nestjs/common';
import { ClientMediaController, MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ controllers: [MediaController, ClientMediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
