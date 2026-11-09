import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'https://watch.example' });
import {
  closeController,
  closePendingControllers,
} from '../src/features/companion/model/controllerCleanup';
const originalFetch = globalThis.fetch;
const token = 'a'.repeat(64);
const key = 'yanemedia-companion-pending-close';
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

test('interrupted revocation keeps a tab-only cleanup proof; an explicit restart retries DELETE before admission', async () => {
  globalThis.fetch = mock(async () => {
    throw new TypeError('page closed');
  }) as typeof fetch;
  await expect(closeController(token)).rejects.toThrow('UNAVAILABLE');
  expect(JSON.parse(sessionStorage.getItem(key)!)[0]).toMatchObject({ token });
  expect(localStorage.length).toBe(0);
  const methods: string[] = [];
  globalThis.fetch = mock(async (url, init) => {
    expect(String(url)).toBe('http://127.0.0.1:45723/v1/controllers/current');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(init?.keepalive).toBe(true);
    methods.push(init!.method!);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await closePendingControllers(AbortSignal.timeout(1000));
  expect(methods).toEqual(['DELETE']);
  expect(sessionStorage.getItem(key)).toBeNull();
});

test('a new helper boot or an already revoked controller clears the cleanup proof without restoring anything', async () => {
  sessionStorage.setItem(key, JSON.stringify([{ token, expiresAt: Date.now() + 180_000 }]));
  globalThis.fetch = mock(async () =>
    Response.json({ error: { code: 'CONTROLLER_REQUIRED' } }, { status: 401 }),
  ) as typeof fetch;
  await closePendingControllers(AbortSignal.timeout(1000));
  expect(sessionStorage.getItem(key)).toBeNull();
});

test('expired, malformed and cancelled cleanup cannot send a controller command', async () => {
  const fetcher = mock(async () => new Response(null, { status: 204 }));
  globalThis.fetch = fetcher as typeof fetch;
  sessionStorage.setItem(
    key,
    JSON.stringify([
      { token, expiresAt: Date.now() - 1 },
      { token: 'invalid', expiresAt: Date.now() + 1000 },
    ]),
  );
  await closePendingControllers(AbortSignal.timeout(1000));
  expect(fetcher).not.toHaveBeenCalled();
  sessionStorage.setItem(key, JSON.stringify([{ token, expiresAt: Date.now() + 1000 }]));
  await expect(closePendingControllers(AbortSignal.abort())).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
