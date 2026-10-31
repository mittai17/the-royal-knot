import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
}

export class Paginated<T> {
  constructor(public items: T[], public meta: { page: number; pageSize: number; total: number }) {}
}

export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const orderBy = (q: PageQuery, allowed: string[], fallback: string) => {
  const field = q.sort && allowed.includes(q.sort) ? q.sort : fallback;
  return { [field]: q.order } as Record<string, 'asc' | 'desc'>;
};
