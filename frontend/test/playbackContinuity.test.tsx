import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act } = await import('react');
const { render, cleanup, screen, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { PlaybackSessionProvider } =
  await import('../src/features/playback-session/model/PlaybackSessionProvider');
const { usePlaybackSession } =
  await import('../src/features/playback-session/model/usePlaybackSession');
const { usePlayerPreferences } =
  await import('../src/features/playback-session/model/usePlayerPreferences');
const players: FakePlayer[] = [];
let sourceGate: Promise<void> | null = null;
class FakePlayer extends HTMLElement {
  host: any;
  navigation: any;
  preferences: any;
  descriptor: any;
  options: any;
  runtime = { getSnapshot: () => ({ durationSeconds: 1200 }) };
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
    if (sourceGate) await sourceGate;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
  connectedCallback() {
    players.push(this);
  }
  emit(type: string, changes = {}) {
    const snapshot = {
      source: { id: 'media', revision: this.descriptor.revision },
      positionSeconds: 42,
      durationSeconds: 1200,
      playback: 'playing',
      intent: 'playing',
      pending: null,
      ...changes,
    };
    this.dispatchEvent(
      new CustomEvent('yp-' + type, { detail: { source: snapshot.source, snapshot } }),
    );
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
const { MediaVideoRenderer } = await import('../src/widgets/media-player/ui/MediaVideoRenderer');
import type { AuthState } from '../src/entities/auth/model/authContext';
import type { MediaSourceOption } from '../src/entities/media-source/model/mediaSource';
import type { PlaybackSessionContextValue } from '../src/features/playback-session/model/playbackSessionContext';
const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
const guest: AuthState = { status: 'guest', user: null };
const noop = () => {};
let playback: PlaybackSessionContextValue;
let visible = true;
let client: InstanceType<typeof QueryClient>;
const originalFetch = globalThis.fetch;
const calls: Array<{ method?: string; url: string }> = [];
function Harness() {
  playback = usePlaybackSession();
  const preferences = usePlayerPreferences();
  const session = playback.session;
  return session ? (
    <>
      {visible ? (
        <MediaVideoRenderer
          source={{
            sourceRef: session.sourceRef,
            provider: 'fixture',
            kind: 'mp4',
            label: 'Fixture',
            url: '/fixture.mp4',
            availability: 'available',
            browserSupported: true,
          }}
          mediaTitle="Fixture"
          shouldAutoPlay={session.state === 'playing'}
          initialPositionSeconds={session.positionSeconds}
          preferences={preferences}
          onReady={noop}
          onError={noop}
          onPlay={() => playback.resumeSession(session)}
          onPause={() => playback.pauseSession(session)}
          onProgress={(p, d, r) => playback.updateProgress(p, d, r, session)}
        />
      ) : null}
    </>
  ) : null;
}
function mount() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  globalThis.fetch = mock(async (url: any, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: init.method });
    return init.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json({ data: { entries: [] } });
  }) as typeof fetch;
  const tree = (state: AuthState = guest) => (
    <QueryClientProvider client={client}>
      <AuthContext
        value={{ state, setAuthenticated: noop, setGuest: noop, refresh: async () => {} }}
      >
        <PlaybackSessionProvider>
          <MemoryRouter>
            <Harness />
          </MemoryRouter>
        </PlaybackSessionProvider>
      </AuthContext>
    </QueryClientProvider>
  );
  return { ...render(tree()), tree };
}
async function start(sourceRef = 'direct-1', episode: any = { seasonNumber: 1, episodeNumber: 2 }) {
  await act(async () =>
    playback.startSession({
      mediaRef,
      mediaSnapshot: { title: 'Fixture' },
      sourceRef,
      episode,
      positionSeconds: 42,
      durationSeconds: 1200,
    }),
  );
}
afterEach(() => {
  cleanup();
  client?.clear();
  localStorage.clear();
  players.length = 0;
  calls.length = 0;
  visible = true;
  sourceGate = null;
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

test('leaving playback flushes confirmed progress, ignores a pending seek and resumes after refresh', async () => {
  const view = mount();
  await start();
  const player = players[0];
  await act(async () => player.emit('statechange'));
  await act(async () => player.emit('positionchange', { positionSeconds: 67 }));
  await act(async () =>
    player.emit('positionchange', { positionSeconds: 900, pending: { type: 'seek' } }),
  );
  visible = false;
  view.rerender(view.tree());
  expect(playback.session).toMatchObject({
    positionSeconds: 67,
    state: 'paused',
    episode: { episodeNumber: 2 },
  });
  expect(screen.queryByRole('button', { name: /Вернуться к просмотру/ })).toBeNull();
  expect(document.querySelector('yane-player')).toBeNull();
  view.unmount();
  const next = mount();
  expect(playback.session).toMatchObject({ positionSeconds: 67, state: 'paused' });
  visible = true;
  next.rerender(next.tree());
  expect(players.at(-1)!.options.positionSeconds).toBe(67);
  expect(players.at(-1)!.options.intent).toBe('paused');
});

test('late callbacks from an old source or episode cannot overwrite the new session', async () => {
  mount();
  await start();
  const old = playback.session!;
  await start('direct-2', { seasonNumber: 1, episodeNumber: 3 });
  await act(async () => {
    playback.updateProgress(999, 1200, 'pause', old);
    playback.pauseSession(old);
  });
  expect(playback.session).toMatchObject({
    sourceRef: 'direct-2',
    positionSeconds: 42,
    state: 'playing',
    episode: { episodeNumber: 3 },
  });
});

test('callbacks from a previous playback of the same file identity cannot overwrite a restarted session', async () => {
  mount();
  await start();
  const old = playback.session!;
  await start();
  expect(playback.session?.playbackKey).not.toBe(old.playbackKey);
  await act(async () => {
    playback.updateProgress(999, 1200, 'pause', old);
    playback.pauseSession(old);
  });
  expect(playback.session).toMatchObject({ positionSeconds: 42, state: 'playing' });
});

test('pagehide writes confirmed session immediately and a different account inherits no session', async () => {
  const view = mount();
  await start();
  await act(async () => players[0].emit('statechange', { positionSeconds: 71 }));
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(JSON.parse(localStorage.getItem('yanemedia-playback-session')!).session).toMatchObject({
    positionSeconds: 71,
    state: 'paused',
  });
  const alice: AuthState = {
    status: 'authenticated',
    user: {
      email: 'alice@example.test',
      displayName: 'Alice',
      createdAt: new Date().toISOString(),
    },
  };
  await act(async () => view.rerender(view.tree(alice)));
  await waitFor(() => expect(playback.session).not.toBeNull());
  await act(async () =>
    view.rerender(view.tree({ ...alice, user: { ...alice.user, email: 'bob@example.test' } })),
  );
  await waitFor(() => expect(playback.session).toBeNull());
  expect(document.querySelector('yane-player')).toBeNull();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

test('initial source and automatic language selection cannot publish zero before resume settles', async () => {
  let settle!: () => void;
  sourceGate = new Promise<void>((resolve) => {
    settle = resolve;
  });
  mount();
  await start();
  await act(async () => players[0].emit('statechange', { positionSeconds: 0, playback: 'ready' }));
  expect(playback.session?.positionSeconds).toBe(42);
  await act(async () => {
    settle();
    await sourceGate;
  });
  await act(async () =>
    players[0].emit('statechange', { positionSeconds: 42, playback: 'paused', intent: 'paused' }),
  );
  expect(playback.session).toMatchObject({ positionSeconds: 42, state: 'paused' });
});

test('ending a session stops its torrent and removing continue-watching stops it too', async () => {
  const view = mount();
  const source = 'torrent:torrent_session_abcdefghijklmnopqrstuv';
  await start(source);
  visible = false;
  view.rerender(view.tree());
  await act(async () => playback.endSession());
  await waitFor(() => expect(playback.session).toBeNull());
  expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  await start(source);
  await act(async () => playback.removeContinueWatchingEntry(mediaRef));
  expect(playback.session).toBeNull();
  expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
});

const aniLibertyEpisodeId = '00000000-0000-4000-8000-000000000001';
const aniLibertySource: MediaSourceOption = {
  sourceRef: `stream:aniliberty-streaming:aniliberty-streaming:123:${aniLibertyEpisodeId}:1080`,
  provider: 'aniliberty-streaming',
  kind: 'hls',
  label: 'AniLiberty',
  url: 'https://cache.libria.fun/episode.m3u8?countryIso=LT',
  availability: 'available',
  browserSupported: true,
};

function aniLibertyRenderer(source: MediaSourceOption, onError = noop) {
  return (
    <MediaVideoRenderer
      source={source}
      mediaTitle="Fixture"
      shouldAutoPlay
      initialPositionSeconds={42}
      onReady={noop}
      onError={onError}
      onPlay={noop}
      onPause={noop}
      onProgress={noop}
    />
  );
}

test('AniLiberty loads the browser CDN and ignores a superseded quality response', async () => {
  const requests: { url: URL; signal?: AbortSignal | null; respond: (value: Response) => void }[] =
    [];
  globalThis.fetch = mock(
    (url: URL, init?: RequestInit) =>
      new Promise<Response>((respond) => requests.push({ url, signal: init?.signal, respond })),
  ) as unknown as typeof fetch;
  const view = render(aniLibertyRenderer(aniLibertySource));
  expect(players[0].setSource).not.toHaveBeenCalled();
  expect(requests[0].url.pathname).toBe(`/api/v1/anime/releases/episodes/${aniLibertyEpisodeId}`);
  expect(requests[0].url.searchParams.get('include')).toBe('id,release,hls_1080');

  view.rerender(
    aniLibertyRenderer({
      ...aniLibertySource,
      sourceRef: aniLibertySource.sourceRef.replace(/1080$/, '480'),
    }),
  );
  expect(requests[0].signal?.aborted).toBe(true);
  const freshUrl = 'https://cache-rfn.libria.fun/episode.m3u8?countryIso=RU&ads=1';
  await act(async () => {
    requests[1].respond(
      Response.json({ id: aniLibertyEpisodeId, release: { id: 123 }, hls_480: freshUrl }),
    );
    requests[0].respond(
      Response.json({
        id: aniLibertyEpisodeId,
        release: { id: 123 },
        hls_1080: 'https://cache-rfn.libria.fun/old.m3u8',
      }),
    );
  });
  expect(players[0].setSource).toHaveBeenCalledTimes(1);
  expect(players[0].descriptor.src).toBe(freshUrl);
  expect(players[0].options.positionSeconds).toBe(42);
});

test('AniLiberty falls back on API failure and honors an explicit regional block', async () => {
  const fetch = mock(async () => new Response(null, { status: 503 }));
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  const view = render(aniLibertyRenderer(aniLibertySource));
  await waitFor(() => expect(players[0].descriptor?.src).toBe(aniLibertySource.url));
  view.unmount();

  fetch.mockImplementation(async () =>
    Response.json({
      id: aniLibertyEpisodeId,
      release: { id: 123, is_blocked_by_geo: true },
      hls_1080: 'https://cache-rfn.libria.fun/episode.m3u8',
    }),
  );
  const onError = mock(noop);
  render(aniLibertyRenderer(aniLibertySource, onError));
  await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(players[1].setSource).not.toHaveBeenCalled();
});
