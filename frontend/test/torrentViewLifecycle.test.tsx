import { afterAll, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });
Object.defineProperty(globalThis, 'MediaSource', {
  configurable: true,
  value: { isTypeSupported: () => true },
});
const { act } = await import('react');
const { render, fireEvent, screen, waitFor, cleanup } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { torrentSessionQueryKeys } = await import('../src/entities/torrent-session');
const { mediaEpisodeAvailabilityQueryKey } = await import('../src/entities/media-source');
import type { TorrentSession } from '../src/entities/torrent-session';

const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
const id = 'torrent_session_abcdefghijklmnopqrstuv';
const email = 'fixture@example.test';
const noop = () => {};
let launch: any;
const episodeModel = await import('../src/features/torrent-launch/model/torrentEpisodes');
const { TorrentFilePicker } = await import('../src/features/torrent-launch/ui/TorrentFilePicker');
mock.module('@/features/torrent-launch', () => ({
  ...episodeModel,
  TorrentFilePicker,
  TorrentLaunch: (props: any) => {
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
    canUpdateFavorites: true,
  }),
}));
mock.module('@/features/media-community', () => ({ MediaCommunity: () => null }));
mock.module('@/features/user-rating', () => ({ UserRating: () => null }));
mock.module('@/widgets/media-info', () => ({
  MediaInfo: () => null,
  MediaFacts: () => null,
  MediaDescriptionPanel: () => null,
}));
let playback: any = {
  status: 'ready',
  continueWatchingEntries: [],
  session: {
    mediaRef,
    sourceRef: `torrent:${id}`,
    state: 'paused',
    positionSeconds: 42,
    episode: null,
  },
  startSession: noop,
  pauseSession: noop,
  resumeSession: noop,
  updateProgress: noop,
  endSession: noop,
};
mock.module('@/features/playback-session', () => ({
  usePlayerPreferences: () => undefined,
  usePlaybackSession: () => playback,
}));

const players: FakePlayer[] = [];
class FakePlayer extends HTMLElement {
  host: any;
  navigation: any;
  volume = 1;
  muted = false;
  disconnected = false;
  descriptor: any;
  options: any;
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
  connectedCallback() {
    players.push(this);
  }
  disconnectedCallback() {
    this.disconnected = true;
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
const { MediaView } = await import('../src/pages/media/ui/MediaView');
const originalFetch = globalThis.fetch;
afterAll(async () => {
  cleanup();
  globalThis.fetch = originalFetch;
  await new Promise((r) => setTimeout(r, 20));
  GlobalRegistrator.unregister();
});

test('owner preparing updates keep the mounted torrent player and its volume/mute', async () => {
  const ready: TorrentSession = {
    id,
    mediaRef,
    state: 'ready',
    version: 5,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    progress: { basisPoints: null, speedBytesPerSecond: 0, peers: 0, downloadedBytes: 0 },
    files: [],
    selectedFileRef: 'file',
    audioTracks: [
      { ref: 'audio', label: 'Original', language: 'eng', channels: 2, isDefault: true },
    ],
    failure: null,
    playback: {
      hlsUrl: '/api/v1/torrent-sessions/' + id + '/hls/master.m3u8',
      generation: 1,
      startPositionSeconds: 42,
      durationSeconds: 1200,
      selectedAudioTrackRef: 'audio',
      audioTracks: [
        { ref: 'audio', label: 'Original', language: 'eng', channels: 2, isDefault: true },
      ],
      playbackRates: [0.5, 1, 2],
      timeline: { absoluteAnchorSeconds: 40, mediaAnchorSeconds: 0.08, windowEndSeconds: 160 },
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = torrentSessionQueryKeys.session(email, id);
  client.setQueryData(key, ready);
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext
          value={{
            state: {
              status: 'authenticated',
              user: { email, displayName: 'Fixture', createdAt: new Date().toISOString() },
            },
            setAuthenticated: noop,
            setGuest: noop,
            refresh: async () => {},
          }}
        >
          <MediaView
            media={{
              mediaRef: mediaRef as any,
              type: 'movie',
              slug: 'fixture',
              title: 'Fixture',
              genres: [],
              countries: [],
              languages: [],
              persons: [{ name: 'Fallback actor', roles: ['actor'] }],
            }}
            animeSeasonChain={[]}
            onAnimeSeasonChange={noop}
            availability={null}
            availabilityPending={false}
            availabilityStatus="ready"
          />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(players).toHaveLength(1));
  expect(screen.queryByRole('heading', { name: 'В ролях' })).toBeNull();
  expect(screen.queryByText('Fallback actor')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Торрент', exact: true }));
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  await waitFor(() => expect(launch).toBeDefined());
  const player = players[0];
  player.volume = 0.17;
  player.muted = true;
  const preparing = { ...ready, state: 'preparing' as const, version: 6, playback: null };
  await act(async () => {
    client.setQueryData(key, preparing);
    launch.onSessionChange(preparing);
  });
  expect(player.disconnected).toBe(false);
  expect(document.querySelector('yane-player')).toBe(player);
  expect(player.volume).toBe(0.17);
  expect(player.muted).toBe(true);
  const replacement = { ...ready, version: 7, playback: { ...ready.playback!, generation: 2 } };
  await act(async () => {
    client.setQueryData(key, replacement);
    launch.onSessionChange(replacement);
  });
  expect(players).toHaveLength(1);
  expect(player.volume).toBe(0.17);
  expect(player.muted).toBe(true);
  await act(async () => {
    client.setQueryData(key, { ...preparing, selectedFileRef: 'other-file' });
    launch.onSessionChange({ ...preparing, selectedFileRef: 'other-file' });
  });
  expect(player.disconnected).toBe(true);
  expect(document.querySelector('yane-player')).toBeNull();
  view.unmount();
  client.clear();
});

test('torrent episode navigation switches real file refs, keeps the element and pause, and commits episode history only when ready', async () => {
  cleanup();
  players.length = 0;
  const audio = { ref: 'audio', label: 'English', language: 'eng', channels: 2, isDefault: true };
  const ready: TorrentSession = {
    id,
    mediaRef,
    state: 'ready',
    version: 5,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    progress: { basisPoints: null, speedBytesPerSecond: 0, peers: 0, downloadedBytes: 0 },
    files: ['Show.S01E01.mkv', 'Show.S01E02.mkv', 'Show.S02E01.mkv'].map((name, index) => ({
      ref: `file-${index}`,
      name,
      sizeBytes: 100,
    })),
    selectedFileRef: 'file-0',
    audioTracks: [audio],
    failure: null,
    playback: {
      hlsUrl: `/api/v1/torrent-sessions/${id}/hls/master.m3u8`,
      generation: 1,
      startPositionSeconds: 42,
      durationSeconds: 1200,
      selectedAudioTrackRef: 'audio',
      audioTracks: [audio],
      playbackRates: [1],
      timeline: { absoluteAnchorSeconds: 42, mediaAnchorSeconds: 0, windowEndSeconds: 162 },
    },
  };
  let current = ready;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = torrentSessionQueryKeys.session(email, id);
  client.setQueryData(key, ready);
  let releaseProbe!: () => void;
  const probeGate = new Promise<void>((resolve) => {
    releaseProbe = resolve;
  });
  const selections: any[] = [];
  const wire = (value: TorrentSession) => ({
    ...value,
    sessionId: value.id,
    status: {
      progressBasisPoints: null,
      downloadSpeedBytesPerSecond: 0,
      peers: 0,
      downloadedBytes: 0,
    },
    files: value.files.map((file) => ({
      fileRef: file.ref,
      displayName: file.name,
      sizeBytes: file.sizeBytes,
      mediaKind: 'video',
    })),
    audioTracks: value.audioTracks.map((track) => ({ ...track, trackRef: track.ref })),
    playback: value.playback
      ? {
          ...value.playback,
          source: { type: 'hls', url: value.playback.hlsUrl },
          supportsSubtitleSelection: false,
          audioTracks: value.playback.audioTracks.map((track) => ({
            ...track,
            trackRef: track.ref,
          })),
        }
      : null,
  });
  globalThis.fetch = mock(async (_url: string, init: RequestInit = {}) => {
    if (init.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      selections.push(body);
      current = {
        ...current,
        selectedFileRef: body.fileRef,
        version: current.version + 1,
        state: 'probing',
        playback: null,
      };
      await probeGate;
      current = { ...current, state: 'awaiting_playback', version: current.version + 1 };
    }
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      current = {
        ...current,
        state: 'ready',
        version: current.version + 1,
        playback: {
          ...ready.playback!,
          hlsUrl: ready.playback!.hlsUrl,
          generation: current.version,
          startPositionSeconds: body.startPositionSeconds,
          timeline: { absoluteAnchorSeconds: 0, mediaAnchorSeconds: 0, windowEndSeconds: 120 },
        },
      };
    }
    return Response.json({ data: wire(current) });
  });
  const started = mock((input: any) => {
    playback = { ...playback, session: { ...playback.session, ...input, state: 'playing' } };
  });
  const paused = mock(() => {
    playback.session.state = 'paused';
  });
  playback = {
    ...playback,
    status: 'ready',
    startSession: started,
    pauseSession: paused,
    continueWatchingEntries: [],
    session: {
      mediaRef,
      sourceRef: `torrent:${id}`,
      episode: { seasonNumber: 1, episodeNumber: 1 },
      positionSeconds: 42,
      state: 'paused',
    },
  };
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext
          value={{
            state: {
              status: 'authenticated',
              user: { email, displayName: 'Fixture', createdAt: new Date().toISOString() },
            },
            setAuthenticated: noop,
            setGuest: noop,
            refresh: async () => {},
          }}
        >
          <MediaView
            media={{
              mediaRef: mediaRef as any,
              type: 'series',
              title: 'Fixture',
              genres: [],
              countries: [],
              languages: [],
              persons: [],
              seasons: [],
            }}
            animeSeasonChain={[]}
            onAnimeSeasonChange={noop}
            availability={null}
            availabilityPending={false}
            availabilityStatus="ready"
          />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(players).toHaveLength(1));
  const player = players[0]!;
  expect(player.navigation.seasons.map((season: any) => season.id)).toEqual(['1', '2']);
  let navigation!: Promise<void>;
  await act(async () => {
    navigation = player.navigation.next({ signal: new AbortController().signal });
  });
  await waitFor(() => expect(selections).toHaveLength(1));
  expect(started).not.toHaveBeenCalled();
  const confirmedRevision = player.descriptor.revision;
  await act(async () =>
    client.setQueryData(key, {
      ...ready,
      selectedFileRef: 'file-1',
      version: 8,
      playback: { ...ready.playback!, generation: 99 },
    }),
  );
  expect(player.descriptor.revision).toBe(confirmedRevision);
  await act(async () =>
    player.dispatchEvent(
      new CustomEvent('yp-error', {
        detail: {
          source: { revision: player.descriptor.revision },
          snapshot: { playback: 'error' },
        },
      }),
    ),
  );
  expect(document.querySelector('yane-player')).toBe(player);
  expect(player.navigation.current).toEqual({ seasonId: '1', episodeId: 'file-0' });
  await act(async () => {
    releaseProbe();
    await navigation;
  });
  expect(selections[0]).toEqual({ fileRef: 'file-1', expectedVersion: 5 });
  expect(started.mock.calls[0]?.[0]).toMatchObject({
    episode: { seasonNumber: 1, episodeNumber: 2 },
    positionSeconds: 0,
  });
  expect(playback.session.state).toBe('paused');
  expect(document.querySelector('yane-player')).toBe(player);
  expect(players).toHaveLength(1);
  expect(player.navigation.current).toEqual({ seasonId: '1', episodeId: 'file-1' });
  await act(async () => {
    await player.navigation.next({ signal: new AbortController().signal });
  });
  expect(playback.session.episode).toEqual({ seasonNumber: 2, episodeNumber: 1 });
  expect(playback.session.positionSeconds).toBe(0);
  expect(player.navigation.next).toBeUndefined();
  view.unmount();
  client.clear();
});

test('series next preserves pause and track, quality changes keep position, history reopens the saved episode', async () => {
  players.length = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const source = (episode: number, height: number) => ({
    sourceRef: `episode-${episode}-${height}`,
    provider: 'fixture',
    kind: 'mp4' as const,
    label: 'English',
    translation: { title: 'English', type: 'original' as const, language: 'en' },
    quality: { label: `${height}p`, height },
    episode: { seasonNumber: 1, episodeNumber: episode },
    url: `/episode-${episode}-${height}.mp4`,
    availability: 'available' as const,
    browserSupported: true,
  });
  const start = mock((input: any) => {
      playback = { ...playback, session: { ...playback.session, ...input } };
    }),
    pause = mock(() => {});
  playback = {
    ...playback,
    continueWatchingEntries: [],
    startSession: start,
    pauseSession: pause,
    session: {
      mediaRef,
      sourceRef: 'episode-2-720',
      state: 'paused',
      positionSeconds: 67,
      durationSeconds: 1200,
      episode: { seasonNumber: 1, episodeNumber: 2 },
    },
  };
  const media = {
    mediaRef: mediaRef as any,
    type: 'series' as const,
    seasons: [],
    slug: 'fixture',
    title: 'Fixture',
    genres: [],
    countries: [],
    languages: [],
    persons: [],
  };
  const props = {
    media,
    animeSeasonChain: [],
    onAnimeSeasonChange: noop,
    availability: {
      sources: [],
      episodes: [1, 2, 3].map((episodeNumber) => ({
        seasonNumber: 1,
        episodeNumber,
        sources: [source(episodeNumber, 720), source(episodeNumber, 1080)],
      })),
      checkedAt: new Date().toISOString(),
      degraded: false,
      hasExpiredSources: false,
    },
    availabilityPending: false,
    availabilityStatus: 'ready' as const,
  };
  for (const episodeNumber of [1, 2, 3])
    client.setQueryData(
      mediaEpisodeAvailabilityQueryKey(mediaRef, { seasonNumber: 1, episodeNumber }),
      { availability: props.availability, settled: true },
    );
  const tree = (key: string) => (
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
          <MediaView key={key} {...props} />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree('playing'));
  await waitFor(() => expect(players).toHaveLength(1));
  const player = players[0];
  expect(player.options).toMatchObject({ positionSeconds: 67, intent: 'paused' });
  let changed: Promise<unknown>;
  await act(async () => {
    changed = player.host.execute(
      { type: 'quality', target: { qualityId: '1080\u001f1080p' } },
      { signal: new AbortController().signal, positionSeconds: 67, intent: 'paused' },
    );
  });
  expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
    sourceRef: 'episode-2-1080',
    positionSeconds: 67,
    episode: { episodeNumber: 2 },
  });
  expect(pause).toHaveBeenCalled();
  await changed!;
  expect(player.navigation.current).toEqual({ seasonId: '1', episodeId: 'season:1:episode:2' });
  expect(document.querySelector('.media-player-toolbar [aria-label="Выбор серии"]')).toBeNull();
  await act(async () => player.navigation.next({ signal: new AbortController().signal }));
  await waitFor(() =>
    expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
      sourceRef: 'episode-3-1080',
      positionSeconds: 0,
      episode: { episodeNumber: 3 },
    }),
  );
  expect(pause.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(document.querySelector('yane-player')).toBe(player);
  expect(player.navigation.current).toEqual({ seasonId: '1', episodeId: 'season:1:episode:3' });
  await act(async () => {
    playback = { ...playback, status: 'loading', continueWatchingEntries: [], session: null };
    view.rerender(tree('history'));
  });
  await act(async () => {
    playback = {
      ...playback,
      status: 'ready',
      continueWatchingEntries: [
        {
          mediaRef,
          sourceRef: 'episode-2-720',
          positionSeconds: 95,
          episode: { seasonNumber: 1, episodeNumber: 2 },
        },
      ],
    };
    view.rerender(tree('history'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Запустить English', exact: true }));
  expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
    sourceRef: 'episode-2-720',
    positionSeconds: 95,
    episode: { episodeNumber: 2 },
  });
  view.unmount();
  client.clear();
});
