import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act } = await import('react');
const { render, cleanup, screen } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
mock.module('@/shared/config/serverTorrent', () => ({ SERVER_TORRENT_ENABLED: false }));
mock.module('@yaneart/yaneplayer', () => ({}));
const noop = () => {};
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
const launch = mock(() => null);
mock.module('@/features/torrent-launch', () => ({ TorrentLaunch: launch }));
const { PlaybackSessionProvider } =
  await import('../src/features/playback-session/model/PlaybackSessionProvider');
const { usePlaybackSession } =
  await import('../src/features/playback-session/model/usePlaybackSession');
const { savePlaybackSession } =
  await import('../src/features/playback-session/model/playbackSessionStorage');
const { saveContinueWatchingEntries } =
  await import('../src/features/playback-session/model/continueWatchingStorage');
const { MediaView } = await import('../src/pages/media/ui/MediaView');
import type { PlaybackSessionContextValue } from '../src/features/playback-session/model/playbackSessionContext';
import type { PlaybackSession } from '../src/entities/playback';

const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
const old: PlaybackSession = {
  mediaRef,
  mediaSnapshot: { title: 'Fixture' },
  sourceRef: 'torrent:torrent_session_abcdefghijklmnopqrstuv',
  episode: null,
  positionSeconds: 42,
  durationSeconds: 120,
  volume: 1,
  state: 'paused',
  updatedAt: new Date().toISOString(),
};
let playback: PlaybackSessionContextValue;
let client: InstanceType<typeof QueryClient>;
const originalFetch = globalThis.fetch;
let requests: string[] = [];
function Probe() {
  playback = usePlaybackSession();
  return null;
}
function mount(withMedia = false) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  savePlaybackSession(null, old);
  saveContinueWatchingEntries([old]);
  globalThis.fetch = mock(async (url: any) => {
    requests.push(String(url));
    return Response.json({ data: { entries: [] } });
  }) as typeof fetch;
  return render(
    <QueryClientProvider client={client}>
      <AuthContext
        value={{
          state: { status: 'guest', user: null },
          setAuthenticated: noop,
          setGuest: noop,
          refresh: async () => {},
        }}
      >
        <PlaybackSessionProvider>
          <MemoryRouter>
            <Probe />
            {withMedia && (
              <MediaView
                media={{
                  mediaRef: mediaRef as any,
                  type: 'movie',
                  slug: 'fixture',
                  title: 'Fixture',
                  genres: [],
                  countries: [],
                  languages: [],
                  persons: [],
                }}
                animeSeasonChain={[]}
                onAnimeSeasonChange={noop}
                onAnimeEpisodeChange={noop}
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
                  episodes: [],
                  checkedAt: new Date().toISOString(),
                  degraded: false,
                  hasExpiredSources: false,
                }}
                availabilityPending={false}
                availabilityStatus="ready"
              />
            )}
          </MemoryRouter>
        </PlaybackSessionProvider>
      </AuthContext>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  client?.clear();
  localStorage.clear();
  requests = [];
  launch.mockClear();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

test('Public hides the Home torrent UI and never mounts launch or polls an old server session', async () => {
  mount(true);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Торрент', exact: true })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Торренты' })).toBeNull();
  expect(launch).not.toHaveBeenCalled();
  expect(requests.some((url) => /torrent-sessions|torrent-candidates/.test(url))).toBe(false);
  expect(document.querySelector('yane-player')).toBeNull();
  expect(playback.session).toBeNull();
  expect(playback.continueWatchingEntries[0]?.positionSeconds).toBe(42);
});

test('Public keeps saved progress but rejects server restore/start and allows ordinary direct playback', async () => {
  mount();
  await act(async () => playback.restoreSession(mediaRef, old.mediaSnapshot));
  expect(playback.session).toBeNull();
  await act(async () => playback.startSession(old));
  expect(playback.session).toBeNull();
  await act(async () => playback.startSession({ ...old, sourceRef: 'direct' }));
  expect(playback.session).toMatchObject({ sourceRef: 'direct', positionSeconds: 42 });
  expect(requests).toHaveLength(0);
});
