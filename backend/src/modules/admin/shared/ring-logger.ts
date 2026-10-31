import { ConsoleLogger, LogLevel } from '@nestjs/common';

export interface LogEntry { id: number; time: string; level: string; context: string; message: string }

const MAX = 2000;
let seq = 0;
const buffer: LogEntry[] = [];

export const logBuffer = {
  push(level: string, context: string | undefined, message: unknown) {
    const text = typeof message === 'string' ? message : message instanceof Error ? (message.stack ?? message.message) : JSON.stringify(message);
    buffer.push({ id: ++seq, time: new Date().toISOString(), level, context: context ?? 'App', message: String(text).slice(0, 4000) });
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  },
  all() { return buffer; },
  clear() { buffer.length = 0; },
};

/** Console logger that also keeps the last 2000 entries in memory (Support & Logs). Installed with Logger.overrideLogger by AdminModule. */
export class RingBufferLogger extends ConsoleLogger {
  constructor(levels?: LogLevel[]) { super('App', levels ? { logLevels: levels } : {}); }
  private rec(level: string, message: unknown, rest: unknown[]) {
    const last = rest[rest.length - 1];
    const ctx = typeof last === 'string' ? last : undefined;
    // For errors Nest passes (message, stack?, context)
    const extra = level === 'error' && rest.length > 1 && typeof rest[0] === 'string' && rest[0].includes('\n') ? `\n${rest[0]}` : '';
    logBuffer.push(level, ctx, typeof message === 'string' ? message + extra : message);
  }
  log(message: unknown, ...rest: unknown[]) { this.rec('log', message, rest); super.log(message, ...rest); }
  error(message: unknown, ...rest: unknown[]) { this.rec('error', message, rest); super.error(message, ...rest); }
  warn(message: unknown, ...rest: unknown[]) { this.rec('warn', message, rest); super.warn(message, ...rest); }
  debug(message: unknown, ...rest: unknown[]) { this.rec('debug', message, rest); super.debug(message, ...rest); }
  verbose(message: unknown, ...rest: unknown[]) { this.rec('verbose', message, rest); super.verbose(message, ...rest); }
}
