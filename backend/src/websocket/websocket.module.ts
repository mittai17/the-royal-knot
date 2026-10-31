import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LiveGateway } from './live.gateway';
import { RealtimeService } from './realtime.service';

@Global() @Module({ imports: [JwtModule.register({})], providers: [LiveGateway, RealtimeService], exports: [RealtimeService, JwtModule] })
export class WebsocketModule {}
