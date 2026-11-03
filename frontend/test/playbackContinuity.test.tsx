import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act } = await import('react');
const { render, cleanup, fireEvent, screen, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { PlaybackSessionProvider } =
  await import('../src/features/playback-session/model/PlaybackSessionProvider');
const { usePlaybackSession } =
  await import('../src/features/playback-session/model/usePlaybackSession');
const { usePlayerPreferences } =
  await import('../src/features/playback-session/model/usePlayerPreferences');
const { WatchDock } = await import('../src/widgets/watch-dock/ui/WatchDock');
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
      ) : (
        <WatchDock
          session={session}
          mediaTitle="Fixture"
          onExpand={noop}
          onClose={playback.endSession}
        />
      )}
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

test('navigation to the dock flushes confirmed progress, ignores a pending seek and resumes after refresh', async () => {
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
  expect(screen.getByRole('button', { name: 'Вернуться к просмотру', exact: true })).toBeDefined();
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

test('closing the dock stops its torrent and removing continue-watching stops it too', async () => {
  const view = mount();
  const source = 'torrent:torrent_session_abcdefghijklmnopqrstuv';
  await start(source);
  visible = false;
  view.rerender(view.tree());
  fireEvent.click(screen.getByRole('button', { name: /Закрыть/ }));
  await waitFor(() => expect(playback.session).toBeNull());
  expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  await start(source);
  await act(async () => playback.removeContinueWatchingEntry(mediaRef));
  expect(playback.session).toBeNull();
  expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
});
