import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role, VendorCategory } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { CreatePoDto, PoQuery, UpdatePoDto } from './procurement.dto';
import { ProcurementService } from './procurement.service';

const WRITE = [Role.PLANNER, Role.FINANCE];
const READ = [Role.PLANNER, Role.FINANCE, Role.VENDOR];

@ApiTags('procurement') @ApiCookieAuth() @Controller('procurement') @Roles(Role.PLANNER, Role.FINANCE)
export class ProcurementController {
  constructor(private svc: ProcurementService) {}
  @Get('rfqs') rfqs(@Query('weddingId') weddingId?: string, @Query('category') category?: VendorCategory) { return this.svc.rfqs({ weddingId, category }); }
  @Get('comparison') comparison(@Query('weddingId', ParseUUIDPipe) weddingId: string, @Query('category') category?: VendorCategory, @Query('rfqGroup') rfqGroup?: string) { return this.svc.comparison(weddingId, category, rfqGroup); }

  // Vendors may read their own (non-draft) orders and accept them.
  @Get('purchase-orders') @Roles(READ) list(@Query() q: PoQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('purchase-orders/:id') @Roles(READ) get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
  @Get('purchase-orders/:id/pdf') @Roles(READ) pdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.renderPdf(id, u); }
  @Post('purchase-orders') @Roles(WRITE) create(@Body() dto: CreatePoDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Patch('purchase-orders/:id') @Roles(WRITE) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePoDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }
  @Post('purchase-orders/:id/send') @Roles(WRITE) send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.transition(id, 'send', u); }
  @Post('purchase-orders/:id/accept') @Roles([...WRITE, Role.VENDOR]) accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.transition(id, 'accept', u); }
  @Post('purchase-orders/:id/fulfil') @Roles(WRITE) fulfil(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.transition(id, 'fulfil', u); }
  @Post('purchase-orders/:id/cancel') @Roles(WRITE) cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.transition(id, 'cancel', u); }
}
