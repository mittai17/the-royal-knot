import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { G } from '../../common/permissions';
import { CreateTaskDto, GenerateTasksDto, TaskQuery, TemplateItemDto, UpdateTaskDto, UpdateTemplateItemDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks') @ApiCookieAuth() @Controller()
export class TasksController {
  constructor(private svc: TasksService) {}
  @Get('tasks') all(@Query() q: TaskQuery, @CurrentUser() u: AuthUser) { return this.svc.list(q, u); }
  @Get('weddings/:id/tasks') forWedding(@Param('id', ParseUUIDPipe) id: string, @Query() q: TaskQuery, @CurrentUser() u: AuthUser) { return this.svc.list({ ...q, pageSize: q.pageSize === 20 ? 200 : q.pageSize }, u, id); }
  @Post('weddings/:id/tasks') @Roles(G.PLANNING) create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTaskDto, @CurrentUser() u: AuthUser) { return this.svc.create(id, dto, u); }
  @Post('weddings/:id/tasks/generate') @Roles(G.PLANNING) generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateTasksDto, @CurrentUser() u: AuthUser) { return this.svc.generate(id, dto, u); }
  @Patch('tasks/:id') @Roles(G.ALL) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, dto, u); }

  @Get('task-templates') templates() { return this.svc.templates(); }
  @Post('task-templates/:id/items') @Roles(Role.PLANNER) addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateItemDto) { return this.svc.addTemplateItem(id, dto); }
  @Patch('task-template-items/:id') @Roles(Role.PLANNER) updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateItemDto) { return this.svc.updateTemplateItem(id, dto); }
  @Delete('task-template-items/:id') @Roles(Role.PLANNER) deleteItem(@Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteTemplateItem(id); }
}
