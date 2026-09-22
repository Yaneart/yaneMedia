import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import { PUBLIC_METADATA_CACHE } from '../cache-policy';

export interface ApiSuccessResponse<T> {
  data: T;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | T | undefined
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T | undefined> {
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler()) === true) {
      return next.handle();
    }

    const usesPublicMetadataCache =
      Reflect.getMetadata(PUBLIC_METADATA_CACHE, context.getHandler()) === true;

    return next.handle().pipe(
      map((data) => {
        const body = { data };
        if (!usesPublicMetadataCache) return body;

        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();
        const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}"`;
        response.setHeader('ETag', etag);

        if (matchesEtag(request.get('If-None-Match'), etag)) {
          response.status(304);
          return undefined;
        }

        return body;
      }),
    );
  }
}

function matchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;

  return ifNoneMatch.split(',').some((candidate) => {
    const value = candidate.trim();
    return value === '*' || value.replace(/^W\//, '') === etag;
  });
}
