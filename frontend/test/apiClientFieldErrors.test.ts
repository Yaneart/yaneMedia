import { afterEach, describe, expect, mock, test } from 'bun:test';

import { ApiClientError, apiRequest } from '../src/shared/api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('API client field errors', () => {
  test('accepts successful responses without a body', async () => {
    globalThis.fetch = mock(async () => new Response(null, { status: 204 })) as typeof fetch;

    await expect(
      apiRequest<void>('/media/work_1/rating', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  test('retains only valid field details from an error envelope', async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            code: 'HANDLE_TAKEN',
            message: 'Этот адрес профиля уже занят',
            details: {
              fields: [
                { path: 'handle', code: 'not_available', message: 'Выберите другой адрес' },
                { path: 42, code: 'invalid', message: 'ignored' },
              ],
            },
          },
        },
        { status: 409 },
      ),
    ) as typeof fetch;

    try {
      await apiRequest('/profile');
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).fields).toEqual([
        { path: 'handle', code: 'not_available', message: 'Выберите другой адрес' },
      ]);
    }
  });
});
