import { afterEach, expect, mock, test } from 'bun:test';
import {
  admitLocalTorrent,
  heartbeatLocalController,
  localOperation,
  localSnapshot,
} from '../src/features/companion/api/companionAdmission';

const originalFetch = globalThis.fetch;
const controller = { token: 'a'.repeat(64), bootId: 'boot' };
const session = 'b'.repeat(32);
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('a brief connection failure recovers a snapshot without repeating admission', async () => {
  let calls = 0;
  globalThis.fetch = mock(async () => {
    if (++calls < 3) throw new TypeError('offline');
    return Response.json({
      sessionId: session,
      revision: 1,
      state: 'awaiting_file',
      files: [],
      downloadedBytes: 0,
    });
  }) as typeof fetch;
  const value = await localSnapshot(controller, session, AbortSignal.timeout(3000));
  expect(value.state).toBe('awaiting_file');
  expect(calls).toBe(3);
});

test('a lost operation read recovers using the same operation ID', async () => {
  const key = crypto.randomUUID();
  const urls: string[] = [];
  globalThis.fetch = mock(async (url) => {
    urls.push(String(url));
    if (urls.length === 1) throw new TypeError('offline');
    return Response.json({ sessionId: session, operationId: key, state: 'pending', revision: 2 });
  }) as typeof fetch;
  expect((await localOperation(controller, key, AbortSignal.timeout(2000))).state).toBe('pending');
  expect(new Set(urls).size).toBe(1);
});

test('heartbeat connection retries are bounded and preserve the controller', async () => {
  let calls = 0;
  globalThis.fetch = mock(async (_url, init) => {
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${controller.token}` });
    calls++;
    throw new TypeError('offline');
  }) as typeof fetch;
  await expect(
    heartbeatLocalController(controller, AbortSignal.timeout(3000)),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls).toBe(3);
});

test('cancel during backoff prevents further connection attempts', async () => {
  let calls = 0;
  const abort = new AbortController();
  globalThis.fetch = mock(async () => {
    calls++;
    throw new TypeError('offline');
  }) as typeof fetch;
  const pending = localSnapshot(controller, session, abort.signal);
  const timer = setTimeout(() => abort.abort(), 30);
  try {
    await expect(pending).rejects.toBeDefined();
  } finally {
    clearTimeout(timer);
  }
  expect(calls).toBe(1);
});

test('expired or revoked controllers and storage failures are not retried', async () => {
  for (const code of [
    'CONTROLLER_REQUIRED',
    'PAIRING_REQUIRED',
    'CACHE_FULL',
    'ENGINE_UNAVAILABLE',
  ]) {
    const transport = mock(async () => Response.json({ error: { code } }, { status: 503 }));
    globalThis.fetch = transport as typeof fetch;
    await expect(
      heartbeatLocalController(controller, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code });
    expect(transport).toHaveBeenCalledTimes(1);
  }
});

test('lost mutation responses are never retried by connection recovery', async () => {
  const transport = mock(async () => {
    throw new TypeError('lost POST');
  });
  globalThis.fetch = transport as typeof fetch;
  await expect(
    admitLocalTorrent(
      controller,
      { kind: 'magnet', value: `magnet:?xt=urn:btih:${'c'.repeat(40)}` },
      crypto.randomUUID(),
      AbortSignal.timeout(1000),
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(transport).toHaveBeenCalledTimes(1);
});
