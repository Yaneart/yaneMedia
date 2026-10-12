import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ReviewSort } from './dto/review.dto';

export const REVIEW_LIST_SNAPSHOT_TTL_MS = 60 * 60_000;

export interface ReviewListCursor {
  snapshotId: string;
  position: number;
}

interface CursorPayload extends ReviewListCursor {
  version: 1;
  mediaRef: string;
  sort: ReviewSort;
  expiresAt: number;
}

@Injectable()
export class ReviewListCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encode(mediaRef: string, sort: ReviewSort, cursor: ReviewListCursor, expiresAt: Date): string {
    const payload: CursorPayload = {
      version: 1,
      mediaRef,
      sort,
      snapshotId: cursor.snapshotId,
      position: cursor.position,
      expiresAt: expiresAt.getTime(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(cursor: string, mediaRef: string, sort: ReviewSort): ReviewListCursor {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, signature] = parts;
      if (!encoded || !signature || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (!isCursorPayload(payload, mediaRef, sort) || payload.expiresAt <= Date.now()) {
        throw new Error('Invalid cursor payload');
      }
      return { snapshotId: payload.snapshotId, position: payload.position };
    } catch {
      throwCursorInvalid();
    }
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret).update(encoded).digest('base64url');
  }

  private hasValidSignature(encoded: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(encoded));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}

function isCursorPayload(
  value: unknown,
  mediaRef: string,
  sort: ReviewSort,
): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    payload.mediaRef === mediaRef &&
    payload.sort === sort &&
    typeof payload.snapshotId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      payload.snapshotId,
    ) &&
    typeof payload.position === 'number' &&
    Number.isSafeInteger(payload.position) &&
    payload.position >= 0 &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt)
  );
}

export function throwCursorInvalid(): never {
  throw new BadRequestException({
    code: 'CURSOR_INVALID',
    message: 'Курсор недействителен или истёк',
  });
}
