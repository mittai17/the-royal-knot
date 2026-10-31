import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { statfs } from 'fs/promises';
import * as os from 'os';
import { HealthService } from '../../../health/health.controller';

interface Sample { t: number; process: number; system: number; rssMb: number }
interface HealthSample { t: number; services: Record<string, string> }

const SAMPLE_MS = 10_000;
const HEALTH_MS = 60_000;

/** In-memory sampler: CPU history every 10 s, service health every 60 s (last ~24 h). Resets on restart. */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private timers: NodeJS.Timeout[] = [];
  private cpu: Sample[] = [];
  private health: HealthSample[] = [];
  private lastProc = process.cpuUsage();
  private lastProcAt = Date.now();
  private lastOs = this.osTimes();
  readonly startedAt = Date.now();

  constructor(private healthSvc: HealthService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.sampleCpu();
    this.timers.push(setInterval(() => this.sampleCpu(), SAMPLE_MS), setInterval(() => void this.sampleHealth(), HEALTH_MS));
    for (const t of this.timers) t.unref();
    void this.sampleHealth();
  }
  onModuleDestroy() { this.timers.forEach(clearInterval); }

  private osTimes() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; } return { idle, total }; }

  private sampleCpu() {
    const now = Date.now(), cu = process.cpuUsage(this.lastProc), dt = (now - this.lastProcAt) * 1000;
    const proc = dt > 0 ? ((cu.user + cu.system) / dt / os.cpus().length) * 100 : 0;
    const o = this.osTimes(), di = o.idle - this.lastOs.idle, dtot = o.total - this.lastOs.total;
    const sys = dtot > 0 ? (1 - di / dtot) * 100 : 0;
    this.lastProc = process.cpuUsage(); this.lastProcAt = now; this.lastOs = o;
    this.cpu.push({ t: now, process: round(proc), system: round(sys), rssMb: Math.round(process.memoryUsage().rss / 1048576) });
    if (this.cpu.length > 90) this.cpu.shift();
  }

  async sampleHealth() {
    try {
      const r = await this.healthSvc.collect();
      this.health.push({ t: Date.now(), services: Object.fromEntries(Object.entries(r.services).map(([k, v]) => [k, v.status])) });
      if (this.health.length > 1440) this.health.shift();
      return r;
    } catch { return null; }
  }

  async snapshot() {
    const r = await this.healthSvc.collect();
    this.health.push({ t: Date.now(), services: Object.fromEntries(Object.entries(r.services).map(([k, v]) => [k, v.status])) });
    if (this.health.length > 1440) this.health.shift();
    const uptime = Object.keys(r.services).map((name) => {
      const hist = this.health.filter((h) => name in h.services && h.services[name] !== 'disabled');
      const up = hist.filter((h) => h.services[name] === 'up').length;
      return { name, ...r.services[name as keyof typeof r.services], uptimePct: hist.length ? round((up / hist.length) * 100) : null, samples: hist.length };
    });
    const mem = process.memoryUsage();
    const disks = await Promise.all([...new Set(['/', process.cwd()])].map(async (path) => {
      try { const s = await statfs(path); const total = s.blocks * s.bsize, free = s.bavail * s.bsize; return { path, totalBytes: total, freeBytes: free, usedBytes: total - free, usedPct: total ? round(((total - free) / total) * 100) : 0 }; }
      catch { return { path, totalBytes: 0, freeBytes: 0, usedBytes: 0, usedPct: 0 }; }
    }));
    const cpu = this.cpu.at(-1);
    return {
      status: r.status, time: r.time, services: uptime,
      process: { pid: process.pid, node: process.version, uptimeSeconds: Math.round(process.uptime()), cpuPct: cpu?.process ?? 0, rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: mem.heapTotal, externalBytes: mem.external },
      system: { hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, arch: os.arch(), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? '', cpuPct: cpu?.system ?? 0, loadAvg: os.loadavg().map(round), totalMemBytes: os.totalmem(), freeMemBytes: os.freemem(), uptimeSeconds: Math.round(os.uptime()) },
      disks, history: this.cpu.map((s) => ({ t: s.t, process: s.process, system: s.system, rssMb: s.rssMb })),
      sampledSince: new Date(this.health[0]?.t ?? this.startedAt).toISOString(),
    };
  }
}
const round = (n: number) => Math.round(n * 10) / 10;
