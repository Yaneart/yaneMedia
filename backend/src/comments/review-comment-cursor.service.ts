import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CURSOR_TTL_MS = 60 * 60_000;
const COMMENT_ID_PATTERN =
  /^comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface ReviewCommentBoundary {
  createdAt: Date;
  commentId: string;
}

export interface ReviewCommentPageCursor {
  after: ReviewCommentBoundary | null;
  ceiling: ReviewCommentBoundary | null;
}

interface CursorPayload {
  version: 1;
  kind: 'page' | 'newer';
  reviewKey: string;
  after: SerializedBoundary | null;
  ceiling?: SerializedBoundary | null;
  expiresAt: number;
}

interface SerializedBoundary {
  createdAt: string;
  commentId: string;
}

@Injectable()
export class ReviewCommentCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encodePage(
    reviewId: string,
    after: ReviewCommentBoundary,
    ceiling: ReviewCommentBoundary,
  ): string {
    return this.encode({
      version: 1,
      kind: 'page',
      reviewKey: this.reviewKey(reviewId),
      after: serialize(after),
      ceiling: serialize(ceiling),
      expiresAt: Date.now() + CURSOR_TTL_MS,
    });
  }

  decodePage(cursor: string, reviewId: string): ReviewCommentPageCursor {
    const payload = this.decode(cursor, reviewId, 'page');
    if (!payload.after || !payload.ceiling) return throwCursorInvalid();
    return { after: deserialize(payload.after), ceiling: deserialize(payload.ceiling) };
  }

  encodeNewer(reviewId: string, boundary: ReviewCommentBoundary | null): string {
    return this.encode({
      version: 1,
      kind: 'newer',
      reviewKey: this.reviewKey(reviewId),
      after: boundary ? serialize(boundary) : null,
      expiresAt: Date.now() + CURSOR_TTL_MS,
    });
  }

  decodeNewer(cursor: string, reviewId: string): ReviewCommentBoundary | null {
    const payload = this.decode(cursor, reviewId, 'newer');
    return payload.after ? deserialize(payload.after) : null;
  }

  private encode(payload: CursorPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  private decode(cursor: string, reviewId: string, kind: CursorPayload['kind']): CursorPayload {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, signature] = parts;
      if (!encoded || !signature || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (
        !isCursorPayload(payload, kind, this.reviewKey(reviewId)) ||
        payload.expiresAt <= Date.now()
      ) {
        throw new Error('Invalid cursor payload');
      }
      return payload;
    } catch {
      return throwCursorInvalid();
    }
  }

  private reviewKey(reviewId: string): string {
    return createHmac('sha256', this.secret)
      .update(`review-comments:${reviewId}`)
      .digest('base64url');
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

function serialize(boundary: ReviewCommentBoundary): SerializedBoundary {
  return { createdAt: boundary.createdAt.toISOString(), commentId: boundary.commentId };
}

function deserialize(boundary: SerializedBoundary): ReviewCommentBoundary {
  return { createdAt: new Date(boundary.createdAt), commentId: boundary.commentId };
}

function isCursorPayload(
  value: unknown,
  kind: CursorPayload['kind'],
  reviewKey: string,
): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    payload.kind === kind &&
    payload.reviewKey === reviewKey &&
    isBoundary(payload.after, true) &&
    (kind === 'newer' || isBoundary(payload.ceiling, false)) &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt)
  );
}

function isBoundary(value: unknown, nullable: boolean): value is SerializedBoundary | null {
  if (nullable && value === null) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const boundary = value as Record<string, unknown>;
  const createdAt =
    typeof boundary.createdAt === 'string' ? new Date(boundary.createdAt) : undefined;
  return (
    createdAt !== undefined &&
    !Number.isNaN(createdAt.getTime()) &&
    typeof boundary.commentId === 'string' &&
    COMMENT_ID_PATTERN.test(boundary.commentId)
  );
}

function throwCursorInvalid(): never {
  throw new BadRequestException({
    code: 'CURSOR_INVALID',
    message: 'Курсор недействителен или истёк',
  });
}
