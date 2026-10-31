import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';

const TTL_MS = 15_000;

/** Key/value store over SystemSetting with a short in-memory cache (cleared by Maintenance > Clear cache). */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { v: unknown; t: number }>();
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.v as T;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const v = (row ? row.value : fallback) as T;
    this.cache.set(key, { v, t: Date.now() });
    return v;
  }

  /** Stored value merged over the defaults (shallow for top level, one level deep for nested plain objects). */
  async getMerged<T extends Record<string, unknown>>(key: string, defaults: T): Promise<T> {
    const stored = await this.get<Record<string, unknown>>(key, {});
    const out: Record<string, unknown> = { ...defaults };
    for (const [k, v] of Object.entries(stored ?? {})) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && defaults[k] && typeof defaults[k] === 'object' ? { ...(defaults[k] as object), ...(v as object) } : v;
    }
    return out as T;
  }

  async set(key: string, value: unknown, actorId: string, audit?: { entity: string; message: string; meta?: Prisma.InputJsonValue }) {
    const json = value as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: json, updatedById: actorId }, update: { value: json, updatedById: actorId } });
    this.cache.delete(key);
    await this.audit.log({ actorId, entity: audit?.entity ?? 'SystemSetting', entityId: key, action: 'update', message: audit?.message ?? `Updated setting ${key}`, meta: audit?.meta });
  }

  clear() { const n = this.cache.size; this.cache.clear(); return n; }
}

/** Trim + length-limit string fields from an untrusted object; unknown keys are dropped. */
export function pickStrings(src: unknown, keys: readonly string[], max = 300): Record<string, string> {
  const out: Record<string, string> = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of keys) { const v = (src as Record<string, unknown>)[k]; if (typeof v === 'string') out[k] = v.trim().slice(0, max); }
  return out;
}
