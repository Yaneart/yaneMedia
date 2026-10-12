import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CURSOR_TTL_MS = 60 * 60_000;

export type PublicProfileCollection = 'favorites' | 'ratings';

export interface ProfileCollectionBoundary {
  addedAt: Date;
  mediaRef: string;
}

interface CursorPayload {
  version: 1;
  collection: PublicProfileCollection;
  handle: string;
  addedAt: string;
  mediaRef: string;
  expiresAt: number;
}

@Injectable()
export class ProfileCollectionCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encode(
    collection: PublicProfileCollection,
    handle: string,
    boundary: ProfileCollectionBoundary,
  ): string {
    const payload: CursorPayload = {
      version: 1,
      collection,
      handle,
      addedAt: boundary.addedAt.toISOString(),
      mediaRef: boundary.mediaRef,
      expiresAt: Date.now() + CURSOR_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(
    cursor: string,
    collection: PublicProfileCollection,
    handle: string,
  ): ProfileCollectionBoundary {
    try {
      const parts = cursor.split('.');
      if (parts.length !== 2) throw new Error('Malformed cursor');
      const [encoded, signature] = parts;
      if (!encoded || !signature || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (!isCursorPayload(payload, collection, handle) || payload.expiresAt <= Date.now()) {
        throw new Error('Invalid cursor payload');
      }

      return { addedAt: new Date(payload.addedAt), mediaRef: payload.mediaRef };
    } catch {
      throw new BadRequestException({
        code: 'CURSOR_INVALID',
        message: 'Курсор недействителен или истёк',
      });
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
  collection: PublicProfileCollection,
  handle: string,
): value is CursorPayload {
  if (!isRecord(value)) return false;
  const addedAt = typeof value.addedAt === 'string' ? new Date(value.addedAt) : undefined;

  return (
    value.version === 1 &&
    value.collection === collection &&
    value.handle === handle &&
    addedAt !== undefined &&
    !Number.isNaN(addedAt.getTime()) &&
    typeof value.mediaRef === 'string' &&
    /^work_[0-9a-f-]{36}$/.test(value.mediaRef) &&
    typeof value.expiresAt === 'number' &&
    Number.isSafeInteger(value.expiresAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
