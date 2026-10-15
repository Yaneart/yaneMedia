import {
  BadRequestException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class StrictReportTargetGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const body = context.switchToHttp().getRequest<Request>().body as unknown;
    const target = isRecord(body) ? body.target : undefined;
    if (!isRecord(target)) throwInvalidTarget();

    const fields = Object.keys(target).sort();
    const expected = target.type === 'review' ? ['reviewId', 'type'] : ['commentId', 'type'];
    if (
      fields.length !== expected.length ||
      fields.some((field, index) => field !== expected[index])
    ) {
      throwInvalidTarget();
    }
    return true;
  }
}

function throwInvalidTarget(): never {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Цель жалобы задана неверно',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
