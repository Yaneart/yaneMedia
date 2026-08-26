import type { ArgumentsHost } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { ApiExceptionFilter } from '../../../src/platform/http/api-error/api-exception/api-exception.filter';
import type { AppLogger } from '../../../src/platform/logging/app-logger';

describe('ApiExceptionFilter', () => {
  it('serializes service unavailability into the public 503 error envelope', () => {
    const logUnexpectedError = jest.fn();
    const logger = {
      logUnexpectedError,
    } as unknown as AppLogger;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
      }),
    } as unknown as ArgumentsHost;
    const filter = new ApiExceptionFilter(logger);

    filter.catch(
      new ServiceUnavailableException('Media providers are temporarily unavailable'),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Media providers are temporarily unavailable',
      },
    });
    expect(logUnexpectedError).not.toHaveBeenCalled();
  });
});
