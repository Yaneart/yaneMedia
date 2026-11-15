import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createLocalPlayback } from '../src/features/companion/model/localPlayback';
import type { LocalSnapshot } from '../src/features/companion/api/companionAdmission';
import type { LocalAudio } from '../src/features/companion/model/localTracks';

const originalFetch = globalThis.fetch;
const session = 'a'.repeat(32),
  file = 'b'.repeat(32),
  audio = 'c'.repeat(64);
const capabilities = [
  'sessions.v1',
  'hls.mse',
  'timeline.windowed-vod',
  'video.original',
  'audio.aac',
  'audio.select',
  'text.prepared',
];
let state: LocalSnapshot;
let audioTracks: LocalAudio[];
let operations: Map<
  string,
  { sessionId: string; operationId: string; revision: number; state: string }
>;
let posts: any[], cancelled: number[], pending: boolean, lost: boolean, supported: boolean;
const json = (value: unknown, status = 200) => Response.json(value, { status });
beforeEach(() => {
  audioTracks = [{ audioRef: audio, label: 'Original', codec: 'aac', channels: 2, default: true }];
  state = {
    sessionId: session,
    revision: 1,
    state: 'awaiting_file',
    files: [{ fileRef: file, name: 'S01E01.mkv', size: 1000 }],
    downloadedBytes: 0,
  };
  posts = [];
  cancelled = [];
  operations = new Map();
  pending = false;
  lost = false;
  supported = true;
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    value: { isTypeSupported: () => supported },
  });
  globalThis.fetch = mock(async (input, init) => {
    const path = new URL(String(input)).pathname;
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect((init!.headers as any).Authorization).toBe('Bearer ' + 'd'.repeat(64));
    if (path.endsWith('/commands')) {
      const body = JSON.parse(init!.body as string);
      expect(body.expectedRevision).toBe(state.revision);
      posts.push(body);
      const key = (init!.headers as any)['Idempotency-Key'];
      state.revision++;
      operations.set(key, {
        sessionId: session,
        operationId: key,
        revision: state.revision,
        state: pending ? 'pending' : 'ready',
      });
      state.selectedFileRef = body.fileRef ?? body.target.fileRef;
      if (body.action === 'probe') {
        state.state = 'awaiting_target';
        state.probe = {
          durationSeconds: 100,
          video: { contentType: 'video/mp4; codecs="avc1.640028"' },
          audioTracks,
          outputs: ['original'],
        };
      } else {
        state.state = 'ready';
        state.target = body.target;
        state.source = {
          id: session,
          revision: state.revision,
          type: 'hls',
          url: `http://127.0.0.1:45723/v1/media/${'e'.repeat(64)}/master.m3u8`,
          audioTracks: state.probe!.audioTracks,
          textTracks: [],
          timeline: {
            mode: 'windowed-vod',
            continuous: true,
            absoluteAnchorSeconds: body.target.positionSeconds,
            mediaAnchorSeconds: 0.08,
            durationSeconds: 100,
          },
        };
      }
      if (lost) {
        lost = false;
        throw new TypeError('response lost');
      }
      return json({ ...operations.get(key), state: state.state }, 202);
    }
    if (path.startsWith('/v1/operations/')) {
      const operation = operations.get(path.split('/').at(-1)!)!;
      if (init?.method === 'DELETE') {
        expect((init.headers as any)['If-Match']).toBe(String(operation.revision));
        cancelled.push(operation.revision);
        operation.state = 'cancelled';
        state.revision++;
        return new Response(null, { status: 204 });
      }
      return json(operation);
    }
    if (path.endsWith('/progress')) return new Response(null, { status: 204 });
    if (path === `/v1/sessions/${session}`) return json(state);
    throw new Error('Unexpected request: ' + path);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function adapter(caps = capabilities, lifetime = new AbortController()) {
  return createLocalPlayback(
    { token: 'd'.repeat(64), bootId: 'fixture', capabilities: caps },
    session,
    lifetime.signal,
  );
}
test('probe precedes codec admission; host seek uses confirmed position and fresh revisions', async () => {
  const ready = await adapter().prepare(file, 12, AbortSignal.timeout(2000));
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
  expect(posts[1].target.positionSeconds).toBe(12);
  const next = await ready.playback.execute(
    { type: 'seek', target: { positionSeconds: 50 } } as any,
    { signal: AbortSignal.timeout(2000), positionSeconds: 12, intent: 'paused' } as any,
  );
  expect(posts[2].expectedRevision).toBe(3);
  expect(next.source.timeline.absoluteAnchorSeconds).toBe(50);
  await ready.playback.report(next.source, 51, AbortSignal.timeout(2000));
});

test('serializes applied subtitle delays and keeps legacy progress compatible', async () => {
  const { playback } = await adapter().prepare(file, 12, AbortSignal.timeout(2000));
  const original = globalThis.fetch;
  const bodies: any[] = [];
  let acknowledge!: (response: Response) => void;
  globalThis.fetch = mock((input, init) => {
    if (new URL(String(input)).pathname.endsWith('/progress')) {
      bodies.push(JSON.parse(init!.body as string));
      return bodies.length === 1
        ? new Promise<Response>((done) => {
            acknowledge = done;
          })
        : Promise.resolve(new Response(null, { status: 204 }));
    }
    return original(input, init);
  }) as typeof fetch;
  const s = { ...playback.source, textWindowSeconds: 30 as const };
  const signal = AbortSignal.timeout(2000);
  const first = playback.report(s, 12, signal, 0);
  await new Promise((done) => setTimeout(done, 0));
  const next = playback.report(s, 12, signal, 60);
  expect(bodies).toHaveLength(1);
  acknowledge(new Response(null, { status: 204 }));
  await Promise.all([first, next]);
  expect(bodies.map((b) => b.textDelaySeconds)).toEqual([0, 60]);
  await playback.report(playback.source, 12, signal, 60);
  expect(bodies[2]).not.toHaveProperty('textDelaySeconds');
});

test('local preparation exposes confirmed stages for the shared Home loading view', async () => {
  const stages: string[] = [];
  const media = createLocalPlayback(
    { token: 'd'.repeat(64), bootId: 'fixture', capabilities },
    session,
    new AbortController().signal,
    (stage) => stages.push(stage),
  );
  await media.prepare(file, 0, AbortSignal.timeout(2000));
  expect(stages).toEqual(['probing', 'preparing', 'ready']);
});
test('incompatible helper and unsupported browser never configure media', async () => {
  await expect(adapter([]).prepare(file, 0, AbortSignal.timeout(2000))).rejects.toThrow(
    'INCOMPATIBLE_VERSION',
  );
  expect(posts).toHaveLength(0);
  supported = false;
  await expect(adapter().prepare(file, 0, AbortSignal.timeout(2000))).rejects.toThrow(
    'UNSUPPORTED_MEDIA',
  );
  expect(posts.map((p) => p.action)).toEqual(['probe']);
});

test('prepares the saved audio language once before playback, retaining the selected track across files', async () => {
  const russian = 'f'.repeat(64);
  audioTracks[0].language = 'eng';
  audioTracks.push({
    ...audioTracks[0],
    audioRef: russian,
    label: 'Russian',
    language: 'rus',
    default: false,
  });
  const media = adapter();
  const ready = await media.prepare(file, 12, AbortSignal.timeout(2000), {
    audioLanguages: ['rus-RU'],
  });
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
  expect(posts[1].target.audioRef).toBe(russian);
  const selected = await ready.playback.execute(
    { type: 'audio', target: { audioId: russian } } as any,
    { signal: AbortSignal.timeout(2000), positionSeconds: 12, intent: 'playing' } as any,
  );
  expect(selected).toEqual({ audioId: russian });
  expect(posts).toHaveLength(2);
  await media.prepare(file, 0, AbortSignal.timeout(2000), { audioLanguages: ['eng'] });
  expect(posts[3].target.audioRef).toBe(russian);
});

test('selecting the active audio acknowledges selection without replacing the same source revision', async () => {
  const ready = await adapter().prepare(file, 12, AbortSignal.timeout(2000));
  const result = await ready.playback.execute(
    { type: 'audio', target: { audioId: audio } } as any,
    { signal: AbortSignal.timeout(2000), positionSeconds: 12, intent: 'paused' } as any,
  );
  expect(result).toEqual({ audioId: audio });
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
});
test('a lost POST response is reconciled without a second submission', async () => {
  lost = true;
  await adapter().prepare(file, 0, AbortSignal.timeout(2000));
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
});
test('cancellation is acknowledged before the next queued file selection', async () => {
  pending = true;
  const playback = adapter();
  const first = new AbortController();
  const promise = playback.prepare(file, 0, first.signal);
  const rejection = promise.then(
    () => null,
    (error) => error,
  );
  while (!posts.length) await new Promise((r) => setTimeout(r, 1));
  first.abort();
  pending = false;
  const second = await playback.prepare(file, 5, AbortSignal.timeout(2000));
  expect(await rejection).toBeInstanceOf(Error);
  expect(cancelled).toEqual([2]);
  expect(posts[1].expectedRevision).toBe(3);
  expect(second.playback.position).toBe(5);
});
test('disposing the controller prevents any late source publication', async () => {
  pending = true;
  const lifetime = new AbortController();
  const promise = adapter(capabilities, lifetime).prepare(file, 0, AbortSignal.timeout(2000));
  const rejection = promise.then(
    () => null,
    (error) => error,
  );
  while (!posts.length) await new Promise((r) => setTimeout(r, 1));
  lifetime.abort();
  expect(await rejection).toBeInstanceOf(Error);
  expect(posts).toHaveLength(1);
  expect(cancelled).toHaveLength(0); // Controller revocation owns teardown.
});
