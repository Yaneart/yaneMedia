import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CURSOR_TTL_MS = 60 * 60_000;

export interface ProfileReviewBoundary {
  createdAt: Date;
  reviewId: string;
}

interface CursorPayload {
  version: 1;
  ownerKey: string;
  createdAt: string;
  reviewId: string;
  expiresAt: number;
}

@Injectable()
export class ProfileReviewCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encode(ownerId: string, boundary: ProfileReviewBoundary): string {
    const payload: CursorPayload = {
      version: 1,
      ownerKey: this.ownerKey(ownerId),
      createdAt: boundary.createdAt.toISOString(),
      reviewId: boundary.reviewId,
      expiresAt: Date.now() + CURSOR_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(cursor: string, ownerId: string): ProfileReviewBoundary {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, signature] = parts;
      if (!encoded || !signature || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (!isCursorPayload(payload, this.ownerKey(ownerId)) || payload.expiresAt <= Date.now()) {
        throw new Error('Invalid cursor payload');
      }
      return { createdAt: new Date(payload.createdAt), reviewId: payload.reviewId };
    } catch {
      throw new BadRequestException({
        code: 'CURSOR_INVALID',
        message: 'Курсор недействителен или истёк',
      });
    }
  }

  private ownerKey(ownerId: string): string {
    return createHmac('sha256', this.secret)
      .update(`review-profile:${ownerId}`)
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

function isCursorPayload(value: unknown, ownerKey: string): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const createdAt = typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : undefined;

  return (
    payload.version === 1 &&
    payload.ownerKey === ownerKey &&
    createdAt !== undefined &&
    !Number.isNaN(createdAt.getTime()) &&
    typeof payload.reviewId === 'string' &&
    /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      payload.reviewId,
    ) &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt)
  );
}
