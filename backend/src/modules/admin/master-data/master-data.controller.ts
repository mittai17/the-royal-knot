import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AllowExternal, AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { SettingsService } from '../shared/settings.service';

export const MASTER_TYPES = ['SERVICE_CATEGORY', 'EVENT_FUNCTION', 'VENDOR_CATEGORY', 'PACKAGE'] as const;
type MasterType = (typeof MASTER_TYPES)[number];

const seedList = (type: MasterType, labels: string[]) => labels.map((label, i) => ({ type, code: label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''), label, sortOrder: i }));
const DEFAULTS = [
  ...seedList('SERVICE_CATEGORY', ['Catering', 'Decor & Floral', 'Photography & Video', 'Venue', 'Makeup & Styling', 'Music & Entertainment', 'Transport', 'Accommodation', 'Lighting & Sound', 'Invitations & Stationery']),
  ...seedList('EVENT_FUNCTION', ['Engagement', 'Haldi', 'Mehendi', 'Sangeet', 'Wedding Ceremony', 'Reception', 'Cocktail Night', 'Farewell Brunch']),
  ...seedList('VENDOR_CATEGORY', ['Catering', 'Decoration', 'Photography', 'Videography', 'Venue', 'Makeup', 'Drummers', 'Entertainment', 'Transportation', 'Accommodation', 'Lighting', 'Sound', 'Other']),
  ...seedList('PACKAGE', ['Full-Service', 'Partial / Day-of']).map((p, i) => ({ ...p, meta: i === 0 ? { description: 'End-to-end planning and execution', startingPrice: 1500000 } : { description: 'Day-of coordination and select vendor management', startingPrice: 500000 } })),
] as Prisma.MasterDataItemCreateManyInput[];

class CreateItemDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[A-Za-z0-9 _&/().,-]+$/, { message: 'type contains invalid characters' }) type: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsString() @MinLength(1) @MaxLength(120) label: string;
  @IsOptional() meta?: Record<string, unknown>;
  @IsOptional() @IsInt() sortOrder?: number;
}
class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @IsOptional() meta?: Record<string, unknown>;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('admin: master data') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/master-data')
export class MasterDataController implements OnModuleInit {
  constructor(private prisma: PrismaService, private audit: AuditService, private settings: SettingsService) {}

  /** One-time idempotent seed of the defaults (guarded by a SystemSetting flag so deleting everything does not resurrect rows). */
  async onModuleInit() {
    try {
      if (await this.settings.get('masterdata.seeded', false)) return;
      await this.prisma.masterDataItem.createMany({ data: DEFAULTS, skipDuplicates: true });
      await this.prisma.systemSetting.upsert({ where: { key: 'masterdata.seeded' }, create: { key: 'masterdata.seeded', value: true }, update: { value: true } });
    } catch { /* DB not ready (unit tests): skipped */ }
  }

  @Get('types') @RequirePermission('master-data', 'read')
  async types() {
    const g = await this.prisma.masterDataItem.groupBy({ by: ['type'], _count: true });
    return [...new Set([...MASTER_TYPES, ...g.map((x) => x.type)])].map((type) => ({ type, count: g.find((x) => x.type === type)?._count ?? 0 }));
  }

  @Get() @RequirePermission('master-data', 'read')
  list(@Query('type') type?: string) {
    return this.prisma.masterDataItem.findMany({ where: type ? { type } : {}, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }] });
  }

  @Post() @RequirePermission('master-data', 'write')
  async create(@Body() dto: CreateItemDto, @CurrentUser() u: AuthUser) {
    const type = dto.type.trim().toUpperCase().replace(/\s+/g, '_');
    const code = (dto.code ?? dto.label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!code) throw new BadRequestException('Could not derive a code from the label');
    if (await this.prisma.masterDataItem.findUnique({ where: { type_code: { type, code } } })) throw new ConflictException(`${dto.label} already exists in ${type}`);
    const max = await this.prisma.masterDataItem.aggregate({ where: { type }, _max: { sortOrder: true } });
    const item = await this.prisma.masterDataItem.create({ data: { type, code, label: dto.label.trim(), meta: (dto.meta ?? undefined) as Prisma.InputJsonValue | undefined, sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1 } });
    await this.audit.log({ actorId: u.id, entity: 'MasterData', entityId: item.id, action: 'create', message: `Added ${type.toLowerCase()} "${item.label}"` });
    return item;
  }

  @Patch(':id') @RequirePermission('master-data', 'write')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.masterDataItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Item not found');
    const item = await this.prisma.masterDataItem.update({ where: { id }, data: { label: dto.label?.trim(), meta: dto.meta as Prisma.InputJsonValue | undefined, sortOrder: dto.sortOrder, active: dto.active } });
    await this.audit.log({ actorId: u.id, entity: 'MasterData', entityId: id, action: dto.active !== undefined && dto.active !== cur.active ? (dto.active ? 'activate' : 'deactivate') : 'update', message: `Updated ${cur.type.toLowerCase()} "${cur.label}"`, meta: { fields: Object.keys(dto) } });
    return item;
  }

  @Delete(':id') @RequirePermission('master-data', 'write')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.masterDataItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Item not found');
    await this.prisma.masterDataItem.delete({ where: { id } });
    await this.audit.log({ actorId: u.id, entity: 'MasterData', entityId: id, action: 'delete', message: `Deleted ${cur.type.toLowerCase()} "${cur.label}"` });
    return { deleted: true };
  }
}

/** Active master-data values for dropdowns in any signed-in area. */
@ApiTags('config') @ApiCookieAuth() @Controller('config/master-data')
export class MasterDataLookupController {
  constructor(private prisma: PrismaService) {}
  @Get(':type') @AllowExternal()
  list(@Param('type') type: string) {
    return this.prisma.masterDataItem.findMany({ where: { type: type.toUpperCase(), active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, code: true, label: true, meta: true } });
  }
}
