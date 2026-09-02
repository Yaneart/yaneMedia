import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of } from 'rxjs';

import { ApiResponseInterceptor } from '../../../src/platform/http/api-response/api-response.interceptor';

describe('ApiResponseInterceptor', () => {
  it('wraps regular HTTP responses in the success envelope', async () => {
    const handler = () => undefined;
    const context = { getHandler: () => handler } as ExecutionContext;
    const next = { handle: () => of({ value: 1 }) } as CallHandler;

    await expect(
      lastValueFrom(new ApiResponseInterceptor().intercept(context, next)),
    ).resolves.toEqual({ data: { value: 1 } });
  });

  it('keeps SSE message events unwrapped', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(SSE_METADATA, true, handler);
    const context = { getHandler: () => handler } as ExecutionContext;
    const event = { data: { state: 'pending' } };
    const next = { handle: () => of(event) } as CallHandler;

    await expect(
      lastValueFrom(new ApiResponseInterceptor().intercept(context, next)),
    ).resolves.toBe(event);
  });
});
