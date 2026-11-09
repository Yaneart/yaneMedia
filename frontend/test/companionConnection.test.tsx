import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://watch.example' });
const { act, StrictMode } = await import('react');
const { renderHook, waitFor, cleanup } = await import('@testing-library/react');
const { useCompanionConnection } =
  await import('../src/features/companion/model/useCompanionConnection');
const { pairingStorage } = await import('../src/features/companion/model/pairingStorage');
const { registerTorrentPlayerStop, torrentAccountSignal } =
  await import('../src/entities/torrent-session');
const { hello, CompanionError } = await import('../src/features/companion/api/companionClient');

const originalFetch = globalThis.fetch;
const savedToken = 'a'.repeat(64);
const pollToken = 'b'.repeat(64);
const requestId = 'c'.repeat(32);
const pairing = {
  requestId,
  pollToken,
  code: '123456',
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
const handshake = {
  product: 'yaneCompanion',
  helperVersion: '0.1.0-dev',
  api: { major: 1, minor: 0 },
  bootId: 'boot',
  capabilities: ['pairing.v1'],
};
let token: string | null;
let calls: { url: string; options: RequestInit & { targetAddressSpace?: string } }[];
let respond: (path: string, method: string) => Response | Promise<Response>;
let write: ReturnType<typeof spyOn>;
let clear: ReturnType<typeof spyOn>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  token = null;
  calls = [];
  spyOn(pairingStorage, 'read').mockImplementation(async () => token);
  write = spyOn(pairingStorage, 'write').mockImplementation(async (value) => {
    token = value;
    return null;
  });
  clear = spyOn(pairingStorage, 'clear').mockImplementation(async () => {
    token = null;
    return null;
  });
  respond = (path, method) => {
    if (path === '/hello') return json(handshake);
    if (path === '/v1/pairings' && method === 'POST') return json(pairing, 201);
    if (path === `/v1/pairings/${requestId}` && method === 'GET')
      return json({ state: 'approved', pairingToken: savedToken });
    if (path === '/v1/pairings/current' && method === 'GET') return json({ state: 'paired' });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error('Unexpected request');
  };
  globalThis.fetch = mock(async (url, options) => {
    calls.push({ url: String(url), options: options! });
    return respond(new URL(String(url)).pathname, options?.method ?? 'GET');
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  mock.restore();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

test('page load reads browser storage without contacting the helper', async () => {
  token = savedToken;
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('saved'));
  expect(calls).toHaveLength(0);
  expect(write).not.toHaveBeenCalled();
});

test('an obsolete StrictMode storage read cannot overwrite a completed explicit connection', async () => {
  let finishObsolete!: (value: string | null) => void;
  spyOn(pairingStorage, 'read')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishObsolete = resolve;
        }),
    )
    .mockImplementation(async () => null);
  const { result } = renderHook(useCompanionConnection, { wrapper: StrictMode });
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  await act(() => result.current.connect());
  expect(result.current.state.status).toBe('paired');
  await act(async () => {
    finishObsolete(savedToken);
  });
  expect(result.current.state.status).toBe('paired');
});

test('explicit pairing keeps each proof on its own route and saves only the approved grant', async () => {
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  await act(() => result.current.connect());
  expect(result.current.state.status).toBe('paired');
  expect(result.current.state.playbackReady).toBe(false);
  expect(token).toBe(savedToken);
  expect(calls.map(({ url }) => new URL(url).pathname)).toEqual([
    '/hello',
    '/v1/pairings',
    `/v1/pairings/${requestId}`,
  ]);
  for (const { url, options } of calls) {
    expect(new URL(url).origin).toBe('http://127.0.0.1:45723');
    expect(url).not.toContain(savedToken);
    expect(url).not.toContain(pollToken);
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(options.cache).toBe('no-store');
    expect(options.targetAddressSpace).toBe('loopback');
    expect(options.referrerPolicy).toBe('no-referrer');
  }
  expect(calls[0].options.headers).toEqual({});
  expect(calls[1].options.body).toBe('{}');
  expect(calls[1].options.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(calls[2].options.headers).toEqual({ Authorization: `Bearer ${pollToken}` });
});

test('saved pairing survives a new boot and requires an explicit validation', async () => {
  token = savedToken;
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('saved'));
  await act(() => result.current.connect());
  expect(result.current.state.status).toBe('paired');
  expect(calls).toHaveLength(2);
  expect(calls[1].url.endsWith('/v1/pairings/current')).toBe(true);
  expect(calls[1].options.headers).toEqual({ Authorization: `Bearer ${savedToken}` });
  expect(write).not.toHaveBeenCalled();
});

test('revoked saved grant is removed and the same user action requests local approval again', async () => {
  token = savedToken;
  const ordinary = respond;
  respond = (path, method) =>
    path === '/v1/pairings/current' && method === 'GET'
      ? json({ error: { code: 'PAIRING_REQUIRED' } }, 401)
      : ordinary(path, method);
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('saved'));
  await act(() => result.current.connect());
  expect(clear).toHaveBeenCalledTimes(1);
  expect(result.current.state.status).toBe('paired');
  expect(calls.some(({ options }) => options.method === 'POST')).toBe(true);
});

test('manual disconnect revokes remotely before deleting the browser grant', async () => {
  token = savedToken;
  const stopped = mock(() => {});
  const unregister = registerTorrentPlayerStop(stopped);
  const lifetime = torrentAccountSignal();
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('saved'));
  await act(() => result.current.disconnect());
  expect(token).toBeNull();
  expect(result.current.state.status).toBe('idle');
  expect(calls[0].options.method).toBe('DELETE');
  expect(calls[0].options.headers).toEqual({ Authorization: `Bearer ${savedToken}` });
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(lifetime.aborted).toBe(true);
  unregister();
});

test('failed revocation preserves the grant for retry or local revocation', async () => {
  token = savedToken;
  respond = () => {
    throw new TypeError('Network failure');
  };
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('saved'));
  await act(() => result.current.disconnect());
  expect(token).toBe(savedToken);
  expect(clear).not.toHaveBeenCalled();
  expect(result.current.state.hasPairing).toBe(true);
  expect(result.current.state.message).toContain('проверьте запуск');
});

test('cancel during approval storage revokes the raced grant and erases the token', async () => {
  let finishWrite!: () => void;
  write.mockImplementation(async (value: string) => {
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    token = value;
    return null;
  });
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  let connecting!: Promise<void>;
  act(() => {
    connecting = result.current.connect();
  });
  await waitFor(() => expect(write).toHaveBeenCalled());
  act(() => result.current.cancel());
  await act(async () => {
    finishWrite();
    await connecting;
  });
  expect(token).toBeNull();
  expect(result.current.state.status).toBe('idle');
  expect(calls.at(-1)?.options.method).toBe('DELETE');
  expect(calls.at(-1)?.options.headers).toEqual({ Authorization: `Bearer ${pollToken}` });
});

test('cancel during request creation waits for the proof and closes the raced request', async () => {
  let finishCreate!: () => void;
  let creationSignal: AbortSignal | undefined;
  const ordinaryFetch = globalThis.fetch;
  globalThis.fetch = mock(async (url, options) => {
    if (String(url).endsWith('/v1/pairings') && options?.method === 'POST') {
      creationSignal = options.signal!;
      await new Promise<void>((resolve) => {
        finishCreate = resolve;
      });
    }
    return ordinaryFetch(url, options);
  }) as typeof fetch;
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  let connecting!: Promise<void>;
  act(() => {
    connecting = result.current.connect();
  });
  await waitFor(() => expect(creationSignal).toBeDefined());
  act(() => result.current.cancel());
  expect(creationSignal!.aborted).toBe(false);
  await act(async () => {
    finishCreate();
    await connecting;
  });
  expect(result.current.state.status).toBe('idle');
  expect(write).not.toHaveBeenCalled();
  expect(calls.at(-1)?.options.method).toBe('DELETE');
  expect(calls.at(-1)?.url.endsWith(`/v1/pairings/${requestId}`)).toBe(true);
});

test('unmount cancels a pending request without retaining its poll bearer', async () => {
  const ordinary = respond;
  respond = (path, method) =>
    path === `/v1/pairings/${requestId}` && method === 'GET'
      ? json({ state: 'pending' })
      : ordinary(path, method);
  const { result, unmount } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  act(() => {
    void result.current.connect();
  });
  await waitFor(() => expect(result.current.state.status).toBe('pending'));
  unmount();
  await waitFor(() => expect(calls.at(-1)?.options.method).toBe('DELETE'));
  expect(write).not.toHaveBeenCalled();
});

test('an incompatible helper cannot request pairing', async () => {
  respond = () => json({ ...handshake, api: { major: 2, minor: 0 } });
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  await act(() => result.current.connect());
  expect(result.current.state.message).toContain('несовместима');
  expect(calls).toHaveLength(1);
  expect(token).toBeNull();
});

test('malformed approved proof is rejected and its request is cancelled', async () => {
  const ordinary = respond;
  respond = (path, method) =>
    path === `/v1/pairings/${requestId}` && method === 'GET'
      ? json({ state: 'approved', pairingToken: 'short' })
      : ordinary(path, method);
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('idle'));
  await act(() => result.current.connect());
  expect(result.current.state.status).toBe('error');
  expect(write).not.toHaveBeenCalled();
  expect(calls.at(-1)?.options.method).toBe('DELETE');
});

test('known browser permission denial is distinguished from an unsupported Permissions API', async () => {
  const query = mock(async () => ({ state: 'denied' }));
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
  respond = () => {
    throw new TypeError('Network failure');
  };
  await expect(hello(new AbortController().signal)).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
  });
  expect(query).toHaveBeenCalledWith({ name: 'loopback-network' });
  query.mockImplementation(async () => {
    throw new TypeError('Unsupported permission');
  });
  await expect(hello(new AbortController().signal)).rejects.toBeInstanceOf(CompanionError);
  await expect(hello(new AbortController().signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});

test('browser storage failure is explicit and does not contact the helper on load', async () => {
  spyOn(pairingStorage, 'read').mockRejectedValue(new Error('PAIRING_STORAGE_UNAVAILABLE'));
  const { result } = renderHook(useCompanionConnection);
  await waitFor(() => expect(result.current.state.status).toBe('error'));
  expect(result.current.state.message).toContain('хранилища');
  expect(calls).toHaveLength(0);
});
