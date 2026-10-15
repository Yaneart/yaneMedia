import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CURSOR_TTL_MS = 60 * 60_000;
const COMMENT_ID_PATTERN =
  /^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface MediaCommentBoundary {
  createdAt: Date;
  commentId: string;
}

interface CursorPayload {
  version: 1;
  mediaKey: string;
  after: SerializedBoundary;
  expiresAt: number;
}

interface SerializedBoundary {
  createdAt: string;
  commentId: string;
}

@Injectable()
export class MediaCommentCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encode(mediaRef: string, after: MediaCommentBoundary): string {
    const payload: CursorPayload = {
      version: 1,
      mediaKey: this.mediaKey(mediaRef),
      after: serialize(after),
      expiresAt: Date.now() + CURSOR_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(cursor: string, mediaRef: string): MediaCommentBoundary {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, signature] = parts;
      if (!encoded || !signature || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (!isCursorPayload(payload, this.mediaKey(mediaRef)) || payload.expiresAt <= Date.now()) {
        throw new Error('Invalid cursor payload');
      }
      return deserialize(payload.after);
    } catch {
      throw new BadRequestException({
        code: 'CURSOR_INVALID',
        message: 'Курсор недействителен или истёк',
      });
    }
  }

  private mediaKey(mediaRef: string): string {
    return createHmac('sha256', this.secret)
      .update(`media-comments:${mediaRef}`)
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

function serialize(boundary: MediaCommentBoundary): SerializedBoundary {
  return { createdAt: boundary.createdAt.toISOString(), commentId: boundary.commentId };
}

function deserialize(boundary: SerializedBoundary): MediaCommentBoundary {
  return { createdAt: new Date(boundary.createdAt), commentId: boundary.commentId };
}

function isCursorPayload(value: unknown, mediaKey: string): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    payload.mediaKey === mediaKey &&
    isBoundary(payload.after) &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt)
  );
}

function isBoundary(value: unknown): value is SerializedBoundary {
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
