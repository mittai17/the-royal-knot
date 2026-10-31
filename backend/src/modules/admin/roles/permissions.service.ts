import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ACTIONS, MODULES, expandMatrix } from '../../../common/permissions';
import { PrismaService } from '../../../database/prisma.service';

type Cell = { read: boolean; write: boolean; approve: boolean };
export type Matrix = Record<string, Record<string, Cell>>;

const TTL_MS = 30_000;
const CODE_DEFAULTS = (() => { const m = new Map<string, boolean>(); for (const r of expandMatrix()) m.set(`${r.role}:${r.module}:${r.action}`, r.allowed); return m; })();

/**
 * DB-backed permission lookup. RolePermission rows (edited in Admin > Roles & Permissions) win; where a row is missing the
 * code-defined PERMISSION_MATRIX is the fallback. 'write' implies 'read'. ADMIN is always allowed.
 */
@Injectable()
export class PermissionsService {
  private cache: { at: number; rows: Map<string, boolean> } | null = null;
  constructor(private prisma: PrismaService) {}

  invalidate() { this.cache = null; }

  private async rows() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.rows;
    const rows = new Map<string, boolean>();
    try { for (const r of await this.prisma.rolePermission.findMany()) rows.set(`${r.role}:${r.module}:${r.action}`, r.allowed); }
    catch { /* DB unavailable: code defaults below */ }
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  private cell(rows: Map<string, boolean>, role: string, module: string, action: string) {
    const k = `${role}:${module}:${action}`;
    return rows.has(k) ? rows.get(k)! : (CODE_DEFAULTS.get(k) ?? false);
  }

  async can(role: Role | string, module: string, action: 'read' | 'write' | 'approve' | string): Promise<boolean> {
    if (role === Role.ADMIN) return true;
    const rows = await this.rows();
    if (this.cell(rows, role, module, action)) return true;
    return action === 'read' ? this.cell(rows, role, module, 'write') : false;
  }

  async matrix(): Promise<Matrix> {
    const rows = await this.rows();
    const out: Matrix = {};
    for (const role of Object.values(Role)) {
      out[role] = {};
      for (const m of MODULES) {
        const write = role === Role.ADMIN || this.cell(rows, role, m, 'write');
        out[role][m] = { read: role === Role.ADMIN || write || this.cell(rows, role, m, 'read'), write, approve: role === Role.ADMIN || this.cell(rows, role, m, 'approve') };
      }
    }
    return out;
  }

  async forRole(role: Role): Promise<string[]> {
    const m = (await this.matrix())[role];
    const list: string[] = [];
    for (const mod of MODULES) for (const a of ACTIONS) if (m[mod][a]) list.push(`${mod}:${a}`);
    return list;
  }
}
