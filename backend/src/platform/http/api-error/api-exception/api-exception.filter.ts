import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '../api-error-response.interface';
import { AppLogger } from '../../../logging/app-logger';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.logUnexpectedError(ApiExceptionFilter.name);
    }

    const body: ApiErrorResponse = {
      error: {
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: exception instanceof HttpException ? exception.message : 'Internal server error',
      },
    };

    response.status(status).json(body);
  }
}
