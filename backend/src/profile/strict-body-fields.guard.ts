import {
  BadRequestException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const STRICT_BODY_FIELDS = 'profile:strict-body-fields';
const STRICT_QUERY_FIELDS = 'profile:strict-query-fields';

export const StrictBodyFields = (...fields: string[]): MethodDecorator =>
  SetMetadata(STRICT_BODY_FIELDS, fields);

export const StrictQueryFields = (...fields: string[]): MethodDecorator =>
  SetMetadata(STRICT_QUERY_FIELDS, fields);

@Injectable()
export class StrictBodyFieldsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedFields = this.reflector.get<string[]>(STRICT_BODY_FIELDS, context.getHandler());
    const body = context.switchToHttp().getRequest<Request>().body as unknown;
    const fields = isRecord(body) ? Object.keys(body) : [];

    if (
      !allowedFields ||
      fields.length === 0 ||
      fields.some((field) => !allowedFields.includes(field))
    ) {
      throw new BadRequestException('Укажите только разрешённые поля для изменения');
    }

    return true;
  }
}

@Injectable()
export class StrictQueryFieldsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedFields = this.reflector.get<string[]>(STRICT_QUERY_FIELDS, context.getHandler());
    const fields = Object.keys(context.switchToHttp().getRequest<Request>().query);

    if (!allowedFields || fields.some((field) => !allowedFields.includes(field))) {
      throw new BadRequestException('Укажите только разрешённые параметры запроса');
    }

    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
