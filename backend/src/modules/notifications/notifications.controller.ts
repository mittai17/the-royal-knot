import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AllowExternal, AuthUser, CurrentUser } from '../../common/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications') @ApiCookieAuth() @Controller('notifications') @AllowExternal()
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @Get() async list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('take') take?: string) {
    const [items, unreadCount] = await Promise.all([this.svc.list(u.id, unread === 'true', Math.min(Math.max(Number(take) || 50, 1), 200)), this.svc.unreadCount(u.id)]);
    return { items, unreadCount };
  }
  @Post('read-all') async readAll(@CurrentUser() u: AuthUser) { await this.svc.markAllRead(u.id); return { ok: true }; }
  @Post(':id/read') async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { await this.svc.markRead(u.id, id); return { ok: true }; }
}
