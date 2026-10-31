import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable, map, tap } from 'rxjs';
import { Paginated } from './pagination';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((v) => {
        if (v instanceof StreamableFile) return v;
        if (v instanceof Paginated) return { data: v.items, meta: v.meta };
        return { data: v === undefined ? null : v };
      }),
    );
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger('HTTP');
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.log(JSON.stringify({ m: req.method, u: req.originalUrl, s: ctx.switchToHttp().getResponse().statusCode, ms: Date.now() - start, user: req.user?.id })),
        error: (e) => this.logger.warn(JSON.stringify({ m: req.method, u: req.originalUrl, s: e?.status ?? 500, ms: Date.now() - start, user: req.user?.id })),
      }),
    );
  }
}
