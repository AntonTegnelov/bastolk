import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/// Logs one line per request with its duration. An interceptor rather than
/// middleware because it sees the handler's completion, including the error
/// case, which is where the interesting durations are.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(`${method} ${url} ${Date.now() - startedAt}ms`),
        error: (error: Error) =>
          this.logger.warn(
            `${method} ${url} ${Date.now() - startedAt}ms failed: ${error.message}`,
          ),
      }),
    );
  }
}
