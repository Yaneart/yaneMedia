import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'https://watch.example' });
const { act } = await import('react');
const { renderHook, waitFor, cleanup } = await import('@testing-library/react');
const { useLocalTorrent } = await import('../src/features/torrent-launch/model/useLocalTorrent');
const { resetTorrentClientScope } = await import('../src/entities/torrent-session');
const { pairingStorage } = await import('../src/features/companion/model/pairingStorage');
const { admitLocalTorrent } = await import('../src/features/companion/api/companionAdmission');
const originalFetch = globalThis.fetch;
const token = 'b'.repeat(64),
  session = 'c'.repeat(32),
  file = 'd'.repeat(32);
const locator = { kind: 'magnet' as const, value: `magnet:?xt=urn:btih:${'a'.repeat(40)}` };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let calls: { path: string; init: RequestInit }[];
let lost: boolean;
let selected: boolean;
let key: string;
let selectKey: string;
beforeEach(() => {
  calls = [];
  lost = false;
  selected = false;
  key = '';
  selectKey = '';
  spyOn(pairingStorage, 'read').mockResolvedValue('a'.repeat(64));
  globalThis.fetch = mock(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('http://127.0.0.1:45723');
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    calls.push({ path: url.pathname, init: init! });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.pathname === '/hello')
      return json({
        product: 'yaneCompanion',
        helperVersion: 'dev',
        api: { major: 1, minor: 0 },
        bootId: 'boot',
        capabilities: [
          'pairing.v1',
          'torrent-admission.v1',
          'torrent-files.v1',
          'sessions.v1',
          'hls.mse',
          'timeline.windowed-vod',
          'video.original',
          'audio.aac',
          'audio.select',
          'text.prepared',
        ],
      });
    if (url.pathname === '/v1/controllers')
      return json({ controllerId: 'a'.repeat(32), controllerToken: token });
    if (url.pathname === '/v1/sessions') {
      key = (init!.headers as Record<string, string>)['Idempotency-Key'];
      if (lost) throw new TypeError('lost POST response');
      return json({ sessionId: session, operationId: key, revision: 1, state: 'metadata' }, 202);
    }
    if (url.pathname.endsWith('/commands')) {
      selected = true;
      selectKey = (init!.headers as Record<string, string>)['Idempotency-Key'];
      return json(
        { sessionId: session, operationId: selectKey, revision: 2, state: 'awaiting_file' },
        202,
      );
    }
    if (url.pathname.startsWith('/v1/operations/'))
      return json({
        sessionId: session,
        operationId: url.pathname.split('/').at(-1),
        revision: selected ? 2 : 1,
        state: 'ready',
      });
    if (url.pathname === `/v1/sessions/${session}`)
      return json({
        sessionId: session,
        revision: selected ? 2 : 1,
        state: 'awaiting_file',
        files: [{ fileRef: file, name: 'pack/one.mkv', size: 2 ** 20 }],
        downloadedBytes: selected ? 2 ** 20 : 0,
        ...(selected ? { selectedFileRef: file } : {}),
      });
    throw new Error('unexpected request');
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  mock.restore();
  globalThis.fetch = originalFetch;
  resetTorrentClientScope();
});
afterAll(() => GlobalRegistrator.unregister());
test('mounting never contacts the helper; explicit admission and file choice use a separate controller', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  expect(calls).toHaveLength(0);
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.state).toBe('awaiting_file'));
  expect(calls.find((c) => c.path === '/v1/sessions')!.init.headers).toMatchObject({
    Authorization: `Bearer ${token}`,
  });
  await act(async () => {
    await result.current.select(file);
  });
  expect(result.current.snapshot?.downloadedBytes).toBe(2 ** 20);
  act(() => result.current.stop());
  await waitFor(() =>
    expect(
      calls.some((c) => c.path === '/v1/controllers/current' && c.init.method === 'DELETE'),
    ).toBe(true),
  );
}, 10000);
test('lost session response reconciles the original key and never resubmits admission', async () => {
  lost = true;
  const { result } = renderHook(() => useLocalTorrent());
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.sessionId).toBe(session), { timeout: 4000 });
  expect(calls.filter((c) => c.path === '/v1/sessions')).toHaveLength(1);
  expect(calls.some((c) => c.path === `/v1/operations/${key}`)).toBe(true);
}, 10000);
test('account switch revokes the old controller and clears the local snapshot', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot).not.toBeNull());
  act(() => resetTorrentClientScope());
  expect(result.current.snapshot).toBeNull();
  expect(
    calls.some((c) => c.path === '/v1/controllers/current' && c.init.method === 'DELETE'),
  ).toBe(true);
});
test('manual metainfo is posted only to the helper with its bounded locator envelope', async () => {
  const input = { kind: 'metainfo' as const, base64: btoa('local-private-metainfo') };
  await admitLocalTorrent(
    { token, bootId: 'boot' },
    input,
    crypto.randomUUID(),
    AbortSignal.timeout(1000),
  );
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ locator: input });
  expect(calls[0].init.headers).not.toHaveProperty('Cookie');
});

test('pagehide clears pending admission so a restored page can start again', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  let interrupted: Promise<void>;
  act(() => {
    interrupted = result.current.start(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
  });
  await waitFor(() => expect(calls.some((call) => call.path === '/v1/controllers')).toBe(true));
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
    await interrupted!;
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.snapshot).toBeNull();
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.state).toBe('awaiting_file'));
});

test('a revision conflict refreshes the picker snapshot before the next explicit choice', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
  const transport = globalThis.fetch;
  globalThis.fetch = mock(async (input, init) => {
    if (String(input).endsWith('/commands')) {
      selected = true;
      return json({ error: { code: 'REVISION_CONFLICT' } }, 409);
    }
    return transport(input, init);
  }) as typeof fetch;
  await act(async () => {
    await result.current.select(file);
  });
  expect(result.current.snapshot?.revision).toBe(2);
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toContain('Состояние раздачи изменилось');
});

test('revoking access during selection clears the unusable picker and releases pending state', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.state).toBe('awaiting_file'));
  const transport = globalThis.fetch;
  globalThis.fetch = mock(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (selected && (path.startsWith('/v1/operations/') || path === `/v1/sessions/${session}`))
      return json({ error: { code: 'CONTROLLER_REQUIRED' } }, 401);
    return transport(input, init);
  }) as typeof fetch;
  await act(async () => {
    await result.current.select(file);
  });
  expect(result.current.snapshot).toBeNull();
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toContain('Доступ к локальной сессии истёк');
  expect(
    calls.some((call) => call.path === '/v1/controllers/current' && call.init.method === 'DELETE'),
  ).toBe(true);
});

test('a failed metadata request clears the ended session so another torrent can be chosen', async () => {
  const transport = globalThis.fetch;
  globalThis.fetch = mock(async (input, init) => {
    if (new URL(String(input)).pathname === `/v1/sessions/${session}`)
      return json({
        sessionId: session,
        revision: 1,
        state: 'failed',
        files: [],
        downloadedBytes: 0,
        error: 'ENGINE_UNAVAILABLE',
      });
    return transport(input, init);
  }) as typeof fetch;
  const { result } = renderHook(() => useLocalTorrent());
  await act(async () => {
    await result.current.start(async () => locator);
  });
  expect(result.current.snapshot).toBeNull();
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toContain('Локальная загрузка прервалась');
});

test('losing access during media preparation releases pending so another torrent can be chosen', async () => {
  const { result } = renderHook(() => useLocalTorrent());
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.state).toBe('awaiting_file'));
  const transport = globalThis.fetch;
  globalThis.fetch = mock(async (input, init) => {
    if (new URL(String(input)).pathname === `/v1/sessions/${session}`)
      return json({ error: { code: 'CONTROLLER_REQUIRED' } }, 401);
    return transport(input, init);
  }) as typeof fetch;
  await act(async () => {
    await result.current.prepare(file).catch(() => {});
  });
  expect(result.current.snapshot).toBeNull();
  expect(result.current.playback).toBeNull();
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toContain('Доступ к локальной сессии истёк');
  globalThis.fetch = transport;
  act(() => {
    void result.current.start(async () => locator);
  });
  await waitFor(() => expect(result.current.snapshot?.state).toBe('awaiting_file'));
});
