import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5174' });
Object.defineProperty(globalThis, 'MediaSource', {
  configurable: true,
  value: { isTypeSupported: () => true },
});
const { act, StrictMode } = await import('react');
const { render, fireEvent, screen, waitFor, cleanup } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { pairingStorage } = await import('../src/features/companion/model/pairingStorage');
const { useLocalTorrent } = await import('../src/features/torrent-launch/model/useLocalTorrent');
const episodeModel = await import('../src/features/torrent-launch/model/torrentEpisodes');
const { TorrentFilePicker } = await import('../src/features/torrent-launch/ui/TorrentFilePicker');
const noop = () => {};
let launch: any;
mock.module('@/shared/config/serverTorrent', () => ({ SERVER_TORRENT_ENABLED: false }));
mock.module('@/features/torrent-launch', () => ({
  ...episodeModel,
  useLocalTorrent,
  TorrentFilePicker,
  TorrentPreparation: () => null,
  TorrentLaunch: () => {
    throw new Error('Public mounted server launch');
  },
  LocalTorrentLaunch: (props: any) => {
    launch = props;
    return null;
  },
}));
mock.module('@/features/favorite', () => ({
  FavoriteButton: () => null,
  useFavorites: () => ({
    isFavorite: () => false,
    isFavoriteUpdating: () => false,
    addFavorite: noop,
    removeFavorite: noop,
    canUpdateFavorites: false,
  }),
}));
mock.module('@/features/media-community', () => ({ MediaCommunity: () => null }));
mock.module('@/features/user-rating', () => ({ UserRating: () => null }));
mock.module('@/widgets/media-info', () => ({
  MediaInfo: () => null,
  MediaDescriptionPanel: () => null,
}));
const { PlaybackSessionProvider, usePlaybackSession } =
  await import('../src/features/playback-session');
const { WatchDock } = await import('../src/widgets/watch-dock/ui/WatchDock');
import type { PlaybackSessionContextValue } from '../src/features/playback-session/model/playbackSessionContext';
import type { AuthState } from '../src/entities/auth/model/authContext';
let history: PlaybackSessionContextValue;
function Probe() {
  history = usePlaybackSession();
  return null;
}
const players: FakePlayer[] = [];
class FakePlayer extends HTMLElement {
  host: any;
  navigation: any;
  descriptor: any;
  options: any;
  timeoutWrites = 0;
  timeout = 15000;
  selection = { audioId: null, textId: null, qualityId: null };
  position = 0;
  intent = 'playing';
  get commandTimeoutMs() {
    return this.timeout;
  }
  set commandTimeoutMs(value: number) {
    this.timeoutWrites++;
    this.timeout = value;
  }
  runtime = {
    getSnapshot: () => ({
      source: this.descriptor && { id: this.descriptor.id, revision: this.descriptor.revision },
      playback: this.intent,
      intent: this.intent,
      pending: null,
      positionSeconds: this.position,
      durationSeconds: 100,
      selection: this.selection,
      textTracks: [],
      seekable: [],
    }),
  };
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
    this.position = options.positionSeconds;
    this.intent = options.intent;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
  connectedCallback() {
    players.push(this);
  }
  emit(position: number, pending: any = null, intent = this.intent) {
    this.position = position;
    this.intent = intent;
    const snapshot = { ...this.runtime.getSnapshot(), pending };
    this.dispatchEvent(
      new CustomEvent('yp-positionchange', { detail: { source: snapshot.source, snapshot } }),
    );
    this.dispatchEvent(
      new CustomEvent('yp-statechange', { detail: { source: snapshot.source, snapshot } }),
    );
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
const { MediaView } = await import('../src/pages/media/ui/MediaView');
const originalFetch = globalThis.fetch;
let client: InstanceType<typeof QueryClient>;
afterEach(async () => {
  await act(async () => {
    cleanup();
    client?.clear();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  localStorage.clear();
  sessionStorage.clear();
  players.length = 0;
  mock.restore();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
const guest: AuthState = { status: 'guest', user: null };
const alice: AuthState = {
  status: 'authenticated',
  user: { email: 'alice@example.test', displayName: 'Alice', createdAt: new Date().toISOString() },
};
function fixture(
  options: {
    auth?: AuthState;
    historyGate?: Promise<any>;
    writeGate?: Promise<void>;
    sourcesPending?: boolean;
    accountEntries?: any[];
  } = {},
) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const session = 'a'.repeat(32),
    first = 'b'.repeat(32),
    second = 'c'.repeat(32),
    audio = 'd'.repeat(64);
  const requests: string[] = [],
    posts: any[] = [],
    accountWrites: any[] = [];
  let helperRunning = true;
  const state: any = {
    sessionId: session,
    revision: 1,
    state: 'awaiting_file',
    files: [
      { fileRef: first, name: 'S01E01.mkv', size: 1000 },
      { fileRef: second, name: 'S01E02.mkv', size: 1000 },
    ],
    downloadedBytes: 0,
  };
  let sourceRevision = 0;
  const operations = new Map();
  spyOn(pairingStorage, 'read').mockResolvedValue('e'.repeat(64));
  globalThis.fetch = mock(async (input, init) => {
    if (!String(input).startsWith('http://127.0.0.1:45723')) {
      const url = String(input);
      expect(url).not.toContain('torrent-sessions');
      if (url.includes('/continue-watching')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(init.body as string);
          accountWrites.push(body);
          if (options.writeGate) await options.writeGate;
          return Response.json({
            data: { entries: [{ ...body, mediaRef, updatedAt: new Date().toISOString() }] },
          });
        }
        return Response.json({
          data: options.historyGate
            ? await options.historyGate
            : { entries: options.accountEntries ?? [] },
        });
      }
      return new Promise<Response>(() => {});
    }
    const path = new URL(String(input)).pathname;
    requests.push(path);
    if (!helperRunning) throw new TypeError('helper stopped');
    expect(path).not.toContain('torrent-sessions');
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (path === '/hello')
      return Response.json({
        product: 'yaneCompanion',
        api: { major: 1 },
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
    if (path === '/v1/controllers')
      return Response.json({ controllerId: 'f'.repeat(32), controllerToken: 'e'.repeat(64) });
    if (path === '/v1/sessions')
      return Response.json({
        sessionId: session,
        operationId: (init!.headers as any)['Idempotency-Key'],
        revision: 1,
        state: 'metadata',
      });
    if (path.endsWith('/commands')) {
      const body = JSON.parse(init!.body as string);
      posts.push(body);
      expect(body.expectedRevision).toBe(state.revision++);
      const key = (init!.headers as any)['Idempotency-Key'];
      operations.set(key, {
        sessionId: session,
        operationId: key,
        revision: state.revision,
        state: 'ready',
      });
      if (body.action === 'probe') {
        if (state.selectedFileRef !== body.fileRef) sourceRevision = 0;
        state.selectedFileRef = body.fileRef;
        state.probe = {
          durationSeconds: 100,
          video: { contentType: 'video/mp4; codecs="avc1.640028"' },
          audioTracks: [
            { audioRef: audio, label: 'Original', codec: 'aac', channels: 2, default: true },
          ],
          outputs: ['original'],
        };
        state.state = 'awaiting_target';
      } else {
        state.target = body.target;
        state.state = 'ready';
        state.source = {
          id: state.selectedFileRef === first ? '1'.repeat(32) : '2'.repeat(32),
          revision: ++sourceRevision,
          type: 'hls',
          url: `http://127.0.0.1:45723/v1/media/${'f'.repeat(64)}/master.m3u8`,
          audioTracks: state.probe.audioTracks,
          textTracks: [],
          timeline: {
            mode: 'windowed-vod',
            continuous: true,
            absoluteAnchorSeconds: body.target.positionSeconds,
            mediaAnchorSeconds: 0,
            durationSeconds: 100,
          },
        };
      }
      return Response.json({ sessionId: session, operationId: key, revision: state.revision });
    }
    if (path.startsWith('/v1/operations/'))
      return Response.json(operations.get(path.split('/').at(-1)));
    if (path === `/v1/sessions/${session}`) return Response.json(state);
    if (path.endsWith('/progress')) return new Response(null, { status: 204 });
    throw new Error('Unexpected request: ' + path);
  }) as typeof fetch;
  let auth = options.auth ?? guest,
    visible = true;
  const tree = () => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthContext
            value={{
              state: auth,
              setAuthenticated: noop,
              setGuest: noop,
              refresh: async () => {},
            }}
          >
            <PlaybackSessionProvider>
              <Probe />
              {visible ? (
                <MediaView
                  media={
                    {
                      mediaRef: mediaRef as any,
                      type: 'series',
                      title: 'Fixture',
                      slug: 'fixture',
                      genres: [],
                      countries: [],
                      languages: [],
                      persons: [],
                      seasons: [
                        { number: 1, episodes: [{ episodeNumber: 1 }, { episodeNumber: 2 }] },
                      ],
                    } as any
                  }
                  animeSeasonChain={[]}
                  onAnimeSeasonChange={noop}
                  availability={
                    options.sourcesPending
                      ? null
                      : {
                          sources: [
                            {
                              sourceRef: 'direct',
                              provider: 'fixture',
                              kind: 'mp4',
                              label: 'Direct',
                              url: '/fixture.mp4',
                              availability: 'available',
                              browserSupported: true,
                            },
                          ],
                          episodes: [1, 2].map((episodeNumber) => ({
                            seasonNumber: 1,
                            episodeNumber,
                            sources: [
                              {
                                sourceRef: `direct:${episodeNumber}`,
                                provider: 'fixture',
                                kind: 'mp4' as const,
                                label: 'Direct',
                                url: '/fixture.mp4',
                                availability: 'available' as const,
                                browserSupported: true,
                                episode: { seasonNumber: 1, episodeNumber },
                              },
                            ],
                          })),
                          checkedAt: '',
                          degraded: false,
                          hasExpiredSources: false,
                        }
                  }
                  availabilityPending={options.sourcesPending ?? false}
                  availabilityStatus={options.sourcesPending ? 'loading' : 'ready'}
                />
              ) : history.session ? (
                <WatchDock
                  session={history.session}
                  mediaTitle="Fixture"
                  onClose={history.endSession}
                  onExpand={noop}
                />
              ) : null}
            </PlaybackSessionProvider>
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(tree());
  return {
    view,
    requests,
    posts,
    accountWrites,
    first,
    second,
    changeAuth(next: AuthState) {
      auth = next;
      view.rerender(tree());
    },
    navigate(show: boolean) {
      visible = show;
      view.rerender(tree());
    },
    restartHelper() {
      helperRunning = false;
    },
  };
}
async function startLocal() {
  if (!screen.queryByRole('tab', { name: 'Торренты' }))
    fireEvent.click(screen.getByRole('button', { name: /^(Direct|Торрент · на устройстве)$/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  act(() => {
    launch.onStart();
    void launch.local.start(async () => ({
      kind: 'magnet',
      value: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    }));
  });
  await waitFor(() => expect(players.find((p) => p.isConnected)?.descriptor).toBeDefined(), {
    timeout: 4000,
  });
  // Descriptor publication precedes the player's async initialization and
  // StrictMode's effect replay. Navigate only after the page reports ready.
  await act(async () => {});
  await waitFor(() =>
    expect(screen.queryByText('Загрузка плеера Торрент · на устройстве')).toBeNull(),
  );
  return players.find((p) => p.isConnected)!;
}

test('Public records only confirmed local episode progress, retains pause and rejects late results after switching to direct', async () => {
  const { requests, posts, second } = fixture();
  expect(requests).toHaveLength(0);
  const player = await startLocal();
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
  expect(player.descriptor.request.credentials).toBe('omit');
  expect(player.navigation.next).toBeDefined();
  act(() => {
    player.emit(30, null, 'paused');
  });
  expect(history.session).toMatchObject({
    sourceRef: 'local-torrent',
    positionSeconds: 30,
    state: 'paused',
    episode: { episodeNumber: 1 },
  });
  act(() => player.emit(90, { type: 'seek' }));
  expect(history.session?.positionSeconds).toBe(30);
  await act(async () => {
    await player.navigation.next({ signal: AbortSignal.timeout(2000) });
  });
  expect(document.querySelector('yane-player')).toBe(player);
  expect(player.options.intent).toBe('paused');
  expect(player.navigation.current.episodeId).toBe(second);
  expect(player.descriptor.revision).toBe('1'); // A different helper source restarts its revision.
  expect(player.timeoutWrites).toBe(1);
  expect(history.session).toMatchObject({
    sourceRef: 'local-torrent',
    episode: { episodeNumber: 2 },
    positionSeconds: 0,
    state: 'paused',
  });
  const saved = JSON.stringify({
    session: JSON.parse(localStorage.getItem('yanemedia-playback-session')!),
    entries: JSON.parse(localStorage.getItem('yanemedia-continue-watching')!),
  });
  expect(saved).not.toMatch(/127\.0\.0\.1|45723|fileRef|audioRef|token|master\.m3u8/);
  expect(saved).not.toContain(second);
  const oldBinding = launch.local.playback;
  fireEvent.click(screen.getByRole('button', { name: 'Торрент · на устройстве', exact: true }));
  fireEvent.click(screen.getByRole('tab', { name: 'Прямое видео' }));
  fireEvent.click(screen.getByRole('button', { name: 'Direct', exact: true }));
  await waitFor(() => expect(launch.local.snapshot).toBeNull());
  await expect(
    oldBinding.execute(
      { type: 'seek', target: { positionSeconds: 50 } },
      { signal: AbortSignal.timeout(2000), positionSeconds: 30 },
    ),
  ).rejects.toThrow();
  expect(requests).toContain('/v1/controllers/current');
});

test('navigation leaves a paused WatchDock card; refresh and a fresh helper admission resume the saved episode and position', async () => {
  const first = fixture();
  let player = await startLocal();
  await act(async () => player.navigation.next({ signal: AbortSignal.timeout(2000) }));
  act(() => player.emit(42));
  act(() => first.navigate(false));
  expect(history.session).toMatchObject({
    state: 'paused',
    positionSeconds: 42,
    episode: { episodeNumber: 2 },
  });
  expect(document.querySelector('yane-player')).toBeNull();
  expect(screen.getByRole('button', { name: 'Вернуться к просмотру', exact: true })).toBeDefined();
  expect(first.requests).toContain('/v1/controllers/current');
  first.view.unmount();
  first.restartHelper();
  client.clear();
  const fresh = fixture();
  expect(fresh.requests).toHaveLength(0);
  expect(screen.getByText('Выберите раздачу для продолжения просмотра')).toBeDefined();
  player = await startLocal();
  expect(fresh.posts[0].fileRef).toBe(fresh.second);
  expect(fresh.posts[1].target.positionSeconds).toBe(42);
  expect(player.options.positionSeconds).toBe(42);
  expect(history.session?.positionSeconds).toBe(42);
});

test('local restore remains available while external source lookup is pending', async () => {
  localStorage.setItem(
    'yanemedia-continue-watching',
    JSON.stringify({
      version: 2,
      entries: [
        {
          mediaRef,
          mediaSnapshot: { title: 'Fixture' },
          sourceRef: 'local-torrent',
          episode: { seasonNumber: 1, episodeNumber: 2 },
          positionSeconds: 47,
          durationSeconds: 100,
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  const app = fixture({ sourcesPending: true });
  expect(screen.getByRole('button', { name: 'Выбрать раздачу', exact: true })).toBeDefined();
  const player = await startLocal();
  expect(app.posts[0].fileRef).toBe(app.second);
  expect(player.options.positionSeconds).toBe(47);
});

test('guest local history and playback are not inherited on login or by a different account', async () => {
  const app = fixture({
    accountEntries: [
      {
        mediaRef,
        sourceRef: 'direct',
        episode: null,
        positionSeconds: 70,
        durationSeconds: 100,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  const player = await startLocal();
  act(() => player.emit(38));
  act(() => app.changeAuth(alice));
  await waitFor(() => expect(history.status).toBe('ready'));
  expect(history.session).toBeNull();
  expect(history.continueWatchingEntries).toHaveLength(1);
  expect(history.continueWatchingEntries[0]?.positionSeconds).toBe(70);
  expect(app.accountWrites).toHaveLength(0);
  expect(app.requests).toContain('/v1/controllers/current');
  expect(document.querySelector('yane-player')).toBeNull();
  act(() => player.emit(99));
  expect(history.session).toBeNull();
  act(() => app.changeAuth(guest));
  expect(history.continueWatchingEntries[0]?.positionSeconds).toBe(38);
  expect(history.session).toBeNull();
});

test('late account history selects its saved file before preparing and account writes contain descriptive progress only', async () => {
  let resolve!: (value: any) => void;
  const historyGate = new Promise((done) => {
    resolve = done;
  });
  const app = fixture({ auth: alice, historyGate });
  fireEvent.click(screen.getByRole('button', { name: 'Direct', exact: true }));
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  act(() => {
    launch.onStart();
    void launch.local.start(async () => ({
      kind: 'magnet',
      value: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    }));
  });
  await waitFor(() => expect(launch.local.snapshot?.state).toBe('awaiting_file'));
  expect(app.posts).toHaveLength(0);
  await act(async () =>
    resolve({
      entries: [
        {
          mediaRef,
          sourceRef: 'torrent:torrent_session_abcdefghijklmnopqrstuv',
          episode: { seasonNumber: 1, episodeNumber: 2 },
          positionSeconds: 47,
          durationSeconds: 100,
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  await waitFor(() => expect(players.find((p) => p.isConnected)?.descriptor).toBeDefined());
  await act(async () => {});
  expect(app.posts[0].fileRef).toBe(app.second);
  expect(app.posts[1].target.positionSeconds).toBe(47);
  const player = players.find((p) => p.isConnected)!;
  act(() => player.emit(52, null, 'paused'));
  await waitFor(() => expect(app.accountWrites.at(-1)?.positionSeconds).toBe(52));
  expect(app.accountWrites.at(-1)).toEqual({
    sourceRef: 'local-torrent',
    episode: { seasonNumber: 1, episodeNumber: 2 },
    positionSeconds: 52,
    durationSeconds: 100,
  });
  act(() => app.changeAuth({ ...alice, user: { ...alice.user, email: 'bob@example.test' } }));
  expect(history.session).toBeNull();
  expect(document.querySelector('yane-player')).toBeNull();
});

test.each([false, true])(
  'logout waits for final confirmed progress behind an in-flight account write (closed=%s)',
  async (closed) => {
    let release!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = fixture({ auth: alice, writeGate });
    await waitFor(() => expect(history.status).toBe('ready'));
    const player = await startLocal();
    await waitFor(() => expect(app.accountWrites.length).toBeGreaterThan(0));
    act(() => player.emit(36));
    if (closed) act(() => history.endSession());
    let finished = false;
    let loggingOut!: Promise<void>;
    act(() => {
      loggingOut = history.prepareForLogout().then(() => {
        finished = true;
      });
    });
    await act(async () => {});
    expect(finished).toBe(false);
    expect(app.requests).toContain('/v1/controllers/current');
    act(() => player.emit(99));
    await act(async () => {
      release();
      await loggingOut;
    });
    expect(app.accountWrites.at(-1)?.positionSeconds).toBe(36);
    if (closed) expect(history.session).toBeNull();
    else expect(history.session).toMatchObject({ positionSeconds: 36, state: 'paused' });
    await act(async () => {
      app.changeAuth(guest);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(history.session).toBeNull();
    expect(history.continueWatchingEntries).toHaveLength(0);
  },
);
