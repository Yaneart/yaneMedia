import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '../api-error-response.interface';
import { AppLogger } from '../../../logging/app-logger';

const STATUS_CODES = new Map<number, string>([
  [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  [HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED'],
  [HttpStatus.FORBIDDEN, 'ACTION_FORBIDDEN'],
  [HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND'],
  [HttpStatus.CONFLICT, 'RESOURCE_CONFLICT'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE'],
  [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'UPSTREAM_UNAVAILABLE'],
]);

type DomainErrorBody = ApiErrorResponse['error'];

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const parserStatus = getBodyParserStatus(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (parserStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);

    if (!(exception instanceof HttpException) && parserStatus === undefined) {
      this.logger.logUnexpectedError(ApiExceptionFilter.name);
    }

    const domainError = exception instanceof HttpException ? getDomainError(exception) : undefined;
    const body: ApiErrorResponse = {
      error: domainError ?? {
        code: STATUS_CODES.get(status) ?? 'INTERNAL_ERROR',
        message:
          exception instanceof HttpException
            ? exception.message
            : parserStatus === HttpStatus.PAYLOAD_TOO_LARGE
              ? 'Payload too large'
              : parserStatus === HttpStatus.BAD_REQUEST
                ? 'Invalid request body'
                : 'Internal server error',
      },
    };

    response.status(status).json(body);
  }
}

function getBodyParserStatus(exception: unknown): number | undefined {
  if (!isRecord(exception)) return undefined;
  if (exception.type === 'entity.too.large') return HttpStatus.PAYLOAD_TOO_LARGE;
  if (exception.type === 'entity.parse.failed') return HttpStatus.BAD_REQUEST;
  return undefined;
}

function getDomainError(exception: HttpException): DomainErrorBody | undefined {
  const response = exception.getResponse();
  if (!isRecord(response) || typeof response.code !== 'string') return undefined;

  const details = getErrorDetails(response.details);
  return {
    code: response.code,
    message: typeof response.message === 'string' ? response.message : exception.message,
    ...(details ? { details } : {}),
  };
}

function getErrorDetails(value: unknown): DomainErrorBody['details'] | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) return undefined;

  const fields = value.fields.filter(
    (field): field is { path: string; code: string; message: string } =>
      isRecord(field) &&
      typeof field.path === 'string' &&
      typeof field.code === 'string' &&
      typeof field.message === 'string',
  );

  return { fields };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
