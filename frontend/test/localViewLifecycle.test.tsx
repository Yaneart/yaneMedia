import { afterAll, expect, mock, spyOn, test } from 'bun:test';
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
const updateProgress = mock(noop);
mock.module('@/features/playback-session', () => ({
  usePlayerPreferences: () => undefined,
  usePlaybackSession: () => ({
    session: null,
    continueWatchingEntries: [],
    status: 'ready',
    startSession: noop,
    pauseSession: noop,
    resumeSession: noop,
    updateProgress,
    endSession: noop,
  }),
}));
const players: FakePlayer[] = [];
class FakePlayer extends HTMLElement {
  host: any;
  navigation: any;
  descriptor: any;
  options: any;
  timeoutWrites = 0;
  timeout = 15000;
  selection = { audioId: null, textId: null, qualityId: null };
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
      playback: 'paused',
      intent: 'paused',
      pending: null,
      positionSeconds: 30,
      durationSeconds: 100,
      selection: this.selection,
      textTracks: [],
      seekable: [],
    }),
  };
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
  connectedCallback() {
    players.push(this);
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
const { MediaView } = await import('../src/pages/media/ui/MediaView');
const originalFetch = globalThis.fetch;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterAll(() => {
  cleanup();
  client.clear();
  mock.restore();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

test('Public page plays local episodes with one player, retains pause and rejects late host results after switching to direct', async () => {
  const session = 'a'.repeat(32),
    first = 'b'.repeat(32),
    second = 'c'.repeat(32),
    audio = 'd'.repeat(64);
  const requests: string[] = [],
    posts: any[] = [];
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
    if (!String(input).startsWith('http://127.0.0.1:45723')) return new Promise<Response>(() => {});
    const path = new URL(String(input)).pathname;
    requests.push(path);
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
          id: state.selectedFileRef,
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
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthContext
            value={{
              state: { status: 'guest', user: null },
              setAuthenticated: noop,
              setGuest: noop,
              refresh: async () => {},
            }}
          >
            <MediaView
              media={
                {
                  mediaRef: 'work_fixture' as any,
                  type: 'series',
                  title: 'Fixture',
                  slug: 'fixture',
                  genres: [],
                  countries: [],
                  languages: [],
                  persons: [],
                  seasons: [{ number: 1, episodes: [{ episodeNumber: 1 }, { episodeNumber: 2 }] }],
                } as any
              }
              animeSeasonChain={[]}
              onAnimeSeasonChange={noop}
              availability={{
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
              }}
              availabilityPending={false}
              availabilityStatus="success"
            />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Direct', exact: true }));
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  expect(requests).toHaveLength(0);
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
  expect(posts.map((p) => p.action)).toEqual(['probe', 'configure']);
  const player = players.find((p) => p.isConnected)!;
  expect(player.descriptor.request.credentials).toBe('omit');
  expect(player.navigation.next).toBeDefined();
  act(() => {
    const snapshot = player.runtime.getSnapshot();
    player.dispatchEvent(
      new CustomEvent('yp-statechange', { detail: { source: snapshot.source, snapshot } }),
    );
  });
  await act(async () => {
    await player.navigation.next({ signal: AbortSignal.timeout(2000) });
  });
  expect(document.querySelector('yane-player')).toBe(player);
  expect(player.options.intent).toBe('paused');
  expect(player.navigation.current.episodeId).toBe(second);
  expect(player.descriptor.revision).toBe('1'); // A different helper source restarts its revision.
  expect(player.timeoutWrites).toBe(1);
  expect(updateProgress).not.toHaveBeenCalled();
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
