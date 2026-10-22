import {
  Injectable,
  HttpException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
  type NestInterceptor,
  type CallHandler,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { defer, filter, finalize, fromEvent, map, takeUntil } from 'rxjs';
import type { AuthRequest } from '../auth/auth-request';

// Per-process budgets: run one backend replica; session admission is also locked in PostgreSQL.
export const TORRENT_LIMITS = {
  create: { user: 20, global: 20, concurrentUser: 1, concurrentGlobal: 2 },
  discovery: { user: 6, global: 30, concurrentUser: 1, concurrentGlobal: 4 },
  polling: { user: 120, global: 1200, concurrentUser: 4, concurrentGlobal: 16 },
  playback: { user: 12, global: 60, concurrentUser: 1, concurrentGlobal: 2 },
  write: { user: 30, global: 120, concurrentUser: 2, concurrentGlobal: 8 },
  stop: { user: 30, global: 120, concurrentUser: 2, concurrentGlobal: 8 },
  hls: { user: 360, global: 1800, concurrentUser: 8, concurrentGlobal: 16 },
} as const;
type Operation = keyof typeof TORRENT_LIMITS;
const LIMIT = 'torrent:limit';
export const TorrentLimit = (operation: Operation) => SetMetadata(LIMIT, operation);
const denied = (status: number, code: string) => new HttpException({ code, message: code }, status);
function limited(response: Response, seconds = 1): never {
  response.setHeader('Retry-After', String(seconds));
  throw denied(429, 'RATE_LIMITED');
}

@Injectable()
export class TorrentBudgets {
  private readonly rates = new Map<string, { count: number; expires: number }>();
  private readonly active = new Map<string, number>();
  private sweepAt = 0;

  rate(budgets: [string, number][], response: Response): void {
    const now = Date.now();
    if (now >= this.sweepAt) {
      for (const [key, entry] of this.rates) if (entry.expires <= now) this.rates.delete(key);
      this.sweepAt = now + 60_000;
    }
    for (const [key, limit] of budgets) {
      const entry = this.rates.get(key);
      if (entry && entry.expires > now && entry.count >= limit)
        limited(response, Math.ceil((entry.expires - now) / 1000));
      if (!entry && this.rates.size >= 10_000) limited(response, 60);
    }
    for (const [key] of budgets) {
      const entry = this.rates.get(key);
      if (!entry || entry.expires <= now) this.rates.set(key, { count: 1, expires: now + 60_000 });
      else entry.count++;
    }
  }

  acquire(budgets: [string, number][], response: Response): () => void {
    for (const [key, limit] of budgets) if ((this.active.get(key) ?? 0) >= limit) limited(response);
    for (const [key] of budgets) this.active.set(key, (this.active.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const [key] of budgets) {
        const count = (this.active.get(key) ?? 1) - 1;
        if (count) this.active.set(key, count);
        else this.active.delete(key);
      }
    };
  }
}

// Runs before cookie lookup, including for media GET and malformed requests.
@Injectable()
export class TorrentOriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly budgets: TorrentBudgets,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    this.budgets.rate(
      [
        [`ip:${request.ip ?? request.socket.remoteAddress}`, 600],
        ['requests:global', 6000],
      ],
      response,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    const allowed = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const site = request.headers['sec-fetch-site'];
    let refererOrigin: string | undefined;
    try {
      if (referer) refererOrigin = new URL(referer).origin;
    } catch {
      throw denied(403, 'ACTION_FORBIDDEN');
    }
    if (
      (origin !== undefined && origin !== allowed) ||
      (refererOrigin !== undefined && refererOrigin !== allowed) ||
      site === 'cross-site' ||
      // same-site includes hostile sibling subdomains; require exact provenance for them.
      (site === 'same-site' && origin !== allowed && refererOrigin !== allowed)
    )
      throw denied(403, 'ACTION_FORBIDDEN');
    return true;
  }
}

@Injectable()
export class TorrentRateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly budgets: TorrentBudgets,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const operation = this.reflector.get<Operation>(LIMIT, context.getHandler());
    if (!operation) throw denied(503, 'TORRENT_UNAVAILABLE');
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const policy = TORRENT_LIMITS[operation];
    this.budgets.rate(
      [
        [`${operation}:user:${request.user!.id}`, policy.user],
        [`${operation}:global`, policy.global],
      ],
      context.switchToHttp().getResponse<Response>(),
    );
    return true;
  }
}

// Outer interceptor acquires before multipart buffering and holds until work actually settles.
@Injectable()
export class TorrentAdmissionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly budgets: TorrentBudgets,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const operation = this.reflector.get<Operation>(LIMIT, context.getHandler());
    const policy = TORRENT_LIMITS[operation];
    const request = context.switchToHttp().getRequest<AuthRequest>();
    return defer(() => {
      const release = this.budgets.acquire(
        [
          [`${operation}:user:${request.user!.id}`, policy.concurrentUser],
          [`${operation}:global`, policy.concurrentGlobal],
        ],
        context.switchToHttp().getResponse<Response>(),
      );
      return defer(() => {
        if (request.aborted && !request.complete) throw denied(408, 'REQUEST_TIMEOUT');
        return next.handle();
      }).pipe(
        // Incomplete upload: no controller work has begun. A closed response after a full
        // request does not release the slot until the running operation settles.
        takeUntil(
          fromEvent(request, 'aborted').pipe(
            filter(() => !request.complete),
            map(() => {
              throw denied(408, 'REQUEST_TIMEOUT');
            }),
          ),
        ),
        finalize(release),
      );
    });
  }
}
