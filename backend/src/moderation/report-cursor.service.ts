import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminReportStatus } from './dto/moderation.dto';

const CURSOR_TTL_MS = 60 * 60_000;

export interface ReportBoundary {
  createdAt: Date;
  reportId: string;
}

interface CursorPayload {
  version: 1;
  status: AdminReportStatus;
  createdAt: string;
  reportId: string;
  expiresAt: number;
}

@Injectable()
export class ReportCursorService {
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(
      config.get<string>('CURSOR_SECRET') ?? randomBytes(32).toString('hex'),
    );
  }

  encode(status: AdminReportStatus, boundary: ReportBoundary): string {
    const payload: CursorPayload = {
      version: 1,
      status,
      createdAt: boundary.createdAt.toISOString(),
      reportId: boundary.reportId,
      expiresAt: Date.now() + CURSOR_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(cursor: string, status: AdminReportStatus): ReportBoundary {
    try {
      const [encoded, signature, extra] = cursor.split('.');
      if (!encoded || !signature || extra || !this.hasValidSignature(encoded, signature)) {
        throw new Error('Invalid cursor');
      }
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      if (!isCursorPayload(payload, status) || payload.expiresAt <= Date.now()) {
        throw new Error('Invalid cursor payload');
      }
      return { createdAt: new Date(payload.createdAt), reportId: payload.reportId };
    } catch {
      throw new BadRequestException({
        code: 'CURSOR_INVALID',
        message: 'Курсор недействителен или истёк',
      });
    }
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret).update(`admin-reports:${encoded}`).digest('base64url');
  }

  private hasValidSignature(encoded: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(encoded));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}

function isCursorPayload(value: unknown, status: AdminReportStatus): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const createdAt = typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : undefined;
  return (
    payload.version === 1 &&
    payload.status === status &&
    createdAt !== undefined &&
    !Number.isNaN(createdAt.getTime()) &&
    typeof payload.reportId === 'string' &&
    REPORT_ID_PATTERN.test(payload.reportId) &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt)
  );
}

const REPORT_ID_PATTERN =
  /^report_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
