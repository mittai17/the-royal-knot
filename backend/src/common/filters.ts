import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const codeFor = (status: number) =>
  ({ 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'UNPROCESSABLE', 429: 'RATE_LIMITED' } as Record<number, string>)[status] ?? 'ERROR';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as string | { message?: string | string[]; details?: unknown };
      if (typeof r === 'string') message = r;
      else if (Array.isArray(r.message)) { message = 'Validation failed'; details = r.message; }
      else { message = r.message ?? exception.message; details = r.details; }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; message = 'A record with these values already exists'; details = exception.meta?.target; }
      else if (exception.code === 'P2025') { status = 404; message = 'Record not found'; }
      else if (exception.code === 'P2034') { status = 409; message = 'The record was changed by someone else at the same time — please retry'; }
      else if (exception.code === 'P2003') { status = 409; message = 'Related record constraint failed'; }
      else this.logger.error(`${req.method} ${req.url} ${exception.code} ${exception.message}`);
    } else {
      this.logger.error(`${req.method} ${req.url} ${(exception as Error)?.stack ?? exception}`);
    }
    res.status(status).json({ error: { code: codeFor(status), message, ...(details ? { details } : {}) } });
  }
}
