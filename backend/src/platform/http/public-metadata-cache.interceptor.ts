import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, of, shareReplay, tap, type Observable } from 'rxjs';

const CACHE_TTL_MS = 60_000;
const MAX_ENTRIES = 64;
const MAX_RESPONSE_BYTES = 512 * 1024;

@Injectable()
export class PublicMetadataCacheInterceptor implements NestInterceptor {
  private readonly cached = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly pending = new Map<string, Observable<unknown>>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method !== 'GET') return next.handle();
    const key = request.originalUrl;

    const cached = this.cached.get(key);
    if (cached) {
      this.cached.delete(key);
      if (cached.expiresAt > Date.now()) {
        this.cached.set(key, cached);
        return of(cached.value);
      }
    }

    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= MAX_ENTRIES) return next.handle();

    const shared = next.handle().pipe(
      tap((value: unknown) => this.remember(key, value)),
      finalize(() => this.pending.delete(key)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.pending.set(key, shared);
    return shared;
  }

  private remember(key: string, value: unknown) {
    const now = Date.now();
    // The featured title rotates at its advertised expiry, even inside the cache TTL.
    const featuredExpiry = (value as { featuredExpiresAt?: string } | null)?.featuredExpiresAt;
    const expiresAt = Math.min(
      now + CACHE_TTL_MS,
      featuredExpiry ? Date.parse(featuredExpiry) : Infinity,
    );
    const json = JSON.stringify(value);
    if (expiresAt <= now || !json || Buffer.byteLength(json) > MAX_RESPONSE_BYTES) return;

    if (this.cached.size >= MAX_ENTRIES) this.cached.delete(this.cached.keys().next().value!);
    this.cached.set(key, { value, expiresAt });
  }
}
