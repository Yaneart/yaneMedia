import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({
  url: 'http://localhost:5173',
  settings: { enableIframePageLoading: true },
});
const { act } = await import('react');
const { render, cleanup, screen, fireEvent, waitFor, within } =
  await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
import type { MediaDetails } from '../src/entities/media';
import type { MediaAvailability, MediaSourceOption } from '../src/entities/media-source';
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
  MediaInfo: ({ navigation }: any) => <div data-testid="anime-navigation">{navigation}</div>,
  MediaDescriptionPanel: () => null,
}));
let playback: any;
const start = mock((input: any) => {
  playback = { ...playback, session: { ...input, state: 'playing' } };
});
const pause = mock(() => {
  playback.session.state = 'paused';
});
mock.module('@/features/playback-session', () => ({
  usePlayerPreferences: () => undefined,
  usePlaybackSession: () => playback,
}));
mock.module('@yaneart/yaneplayer', () => ({}));
class FakePlayer extends HTMLElement {
  runtime?: { getSnapshot: () => any };
  host: any;
  navigation: any;
  descriptor: any;
  options: any;
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
}
customElements.define('yane-player', FakePlayer);
const { MediaView } = await import('../src/pages/media/ui/MediaView');
const { mediaEpisodeAvailabilityQueryKey } = await import('../src/entities/media-source');
const originalFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60' as const;
function source(season: number, episode: number, kind: 'mp4' | 'embed' = 'mp4'): MediaSourceOption {
  return {
    sourceRef: `${kind}:${season}:${episode}`,
    provider: 'fixture',
    kind,
    label: 'Fixture',
    translation: { title: 'Original', type: 'original', language: 'en' },
    quality: { label: '720p', height: 720 },
    episode: { seasonNumber: season, episodeNumber: episode },
    url:
      kind === 'embed'
        ? `about:blank#${season}-${episode}`
        : `https://fixture.test/${kind}/${season}/${episode}`,
    availability: 'available',
    browserSupported: true,
  };
}
function availability(sources: MediaSourceOption[] = []): MediaAvailability {
  return {
    sources: [],
    episodes: sources.map((item) => ({ ...item.episode, sources: [item] })),
    checkedAt: new Date().toISOString(),
    degraded: false,
    hasExpiredSources: false,
  };
}
function response(sources: MediaSourceOption[] = []) {
  return new Response(
    `data: ${JSON.stringify({ state: 'complete', availability: availability(sources) })}\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
function mount(kind: 'mp4' | 'embed' = 'mp4', anime = false, started = true, confirmed = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const initial = source(1, 1, kind);
  const episodes = [1, 2, 3].map((episodeNumber) => ({ episodeNumber }));
  const media = {
    mediaRef,
    slug: 'fixture',
    title: 'Fixture',
    genres: [],
    countries: [],
    languages: [],
    persons: [],
    ...(anime
      ? { type: 'anime', animeKind: 'tv', episodes }
      : { type: 'series', seasons: [1, 2].map((number) => ({ number, episodes })) }),
  } as MediaDetails;
  const catalog = availability([initial]);
  if (kind === 'mp4')
    catalog.episodes[0]!.sources.push({
      ...initial,
      sourceRef: 'quality:1080',
      quality: { label: '1080p', height: 1080 },
      url: 'https://fixture.test/1080.mp4',
    });
  if (kind === 'embed') catalog.sources = [initial];
  if (confirmed)
    client.setQueryData(
      mediaEpisodeAvailabilityQueryKey(mediaRef, {
        seasonNumber: 1,
        episodeNumber: 1,
        ...(anime ? { absoluteEpisodeNumber: 1 } : {}),
      }),
      { availability: catalog, settled: true },
    );
  playback = {
    status: 'ready',
    continueWatchingEntries: [],
    session: started
      ? {
          mediaRef,
          sourceRef: initial.sourceRef,
          state: 'paused',
          positionSeconds: 67,
          episode: {
            seasonNumber: 1,
            episodeNumber: 1,
            ...(anime ? { absoluteEpisodeNumber: 1 } : {}),
          },
        }
      : null,
    startSession: start,
    pauseSession: pause,
    resumeSession: noop,
    updateProgress: noop,
    endSession: () => {
      playback = { ...playback, session: null };
    },
  };
  const chain = anime
    ? [1, 2].map((number) => ({
        number,
        releaseIndex: number - 1,
        mediaRef: number === 1 ? mediaRef : 'shikimori:2',
        slug: `anime-${number}`,
        title: `Anime ${number}`,
        episodesCount: 3,
        seasonEpisodeOffset: 0,
        absoluteEpisodeOffset: (number - 1) * 3,
        canonicalMappingVerified: true,
      }))
    : [];
  const tree = () => (
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
            media={media}
            animeSeasonChain={chain as any}
            onAnimeSeasonChange={noop}
            availability={catalog}
            availabilityPending={false}
            availabilityStatus="ready"
          />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    view,
    tree,
    client,
    catalog,
    player: () => document.querySelector('yane-player') as FakePlayer,
  };
}
afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) {
    await client.cancelQueries();
    client.clear();
  }
  start.mockClear();
  pause.mockClear();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 20));
  GlobalRegistrator.unregister();
});

test('menu confirms a fetched season only after success and keeps the same paused player', async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = mock(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const { player } = mount();
  const original = player();
  expect(original.navigation.seasons.map((season: any) => season.id)).toEqual(['1', '2']);
  let pending!: Promise<void>;
  await act(async () => {
    pending = original.navigation.select(
      { seasonId: '2', episodeId: 'season:2:episode:2' },
      { signal: new AbortController().signal },
    );
  });
  expect(original.navigation.current).toEqual({ seasonId: '1', episodeId: 'season:1:episode:1' });
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    release(response([source(2, 2)]));
    await pending;
  });
  expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
    sourceRef: 'mp4:2:2',
    positionSeconds: 0,
    episode: { seasonNumber: 2, episodeNumber: 2 },
  });
  expect(pause).toHaveBeenCalled();
  expect(player()).toBe(original);
  expect(original.navigation.current).toEqual({ seasonId: '2', episodeId: 'season:2:episode:2' });
  expect(original.options).toMatchObject({ intent: 'paused', positionSeconds: 0 });
});

test('failed and aborted episode lookups preserve the confirmed episode and allow retry', async () => {
  globalThis.fetch = mock(async () => response());
  const { player } = mount();
  const target = { seasonId: '1', episodeId: 'season:1:episode:2' };
  await expect(
    player().navigation.select(target, { signal: new AbortController().signal }),
  ).rejects.toThrow();
  expect(player().navigation.current.episodeId).toBe('season:1:episode:1');
  let release!: (response: Response) => void;
  globalThis.fetch = mock(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const request = new AbortController();
  const pending = player()
    .navigation.select(target, { signal: request.signal })
    .catch((error: Error) => error);
  request.abort();
  release(response([source(1, 2)]));
  expect(await pending).toBeInstanceOf(Error);
  expect(start).not.toHaveBeenCalled();
  globalThis.fetch = mock(async () => response([source(1, 2)]));
  await act(async () => {
    await player().navigation.select(target, { signal: new AbortController().signal });
  });
  expect(player().navigation.current.episodeId).toBe('season:1:episode:2');
});

test('a newer episode request wins over a late answer from the previous request', async () => {
  const releases = new Map<string, (response: Response) => void>();
  globalThis.fetch = mock(
    (input) =>
      new Promise<Response>((resolve) => {
        releases.set(new URL(String(input)).searchParams.get('episodeNumber')!, resolve);
      }),
  );
  const { player } = mount();
  const context = () => ({ signal: new AbortController().signal });
  const old = player()
    .navigation.select({ seasonId: '1', episodeId: 'season:1:episode:2' }, context())
    .catch(noop);
  const fresh = player().navigation.select(
    { seasonId: '1', episodeId: 'season:1:episode:3' },
    context(),
  );
  await act(async () => {
    releases.get('3')!(response([source(1, 3)]));
    await fresh;
  });
  await act(async () => {
    releases.get('2')!(response([source(1, 2)]));
    await old;
  });
  expect(start).toHaveBeenCalledTimes(1);
  expect(player().navigation.current.episodeId).toBe('season:1:episode:3');
});

test('a source change cancels a pending episode without allowing its late response to restart playback', async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = mock(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const { player } = mount();
  const original = player();
  const old = original.navigation
    .select(
      { seasonId: '1', episodeId: 'season:1:episode:2' },
      { signal: new AbortController().signal },
    )
    .catch(noop);
  let changed!: Promise<unknown>;
  await act(async () => {
    changed = original.host.execute(
      { type: 'quality', target: { qualityId: '1080\u001f1080p' } },
      { signal: new AbortController().signal, positionSeconds: 67, intent: 'paused' },
    );
  });
  await changed;
  await act(async () => {
    release(response([source(1, 2)]));
    await old;
  });
  expect(start).toHaveBeenCalledTimes(1);
  expect(start.mock.calls[0]?.[0]).toMatchObject({
    sourceRef: 'quality:1080',
    positionSeconds: 67,
  });
  expect(original.navigation.current.episodeId).toBe('season:1:episode:1');
});

test('anime exposes only the current work episodes and keeps work navigation in the card', () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { player } = mount('mp4', true);
  expect(player().navigation.seasons).toBeUndefined();
  expect(player().navigation.episodes).toHaveLength(3);
  expect(player().navigation.current).toEqual({ episodeId: 'season:1:episode:1' });
  expect(screen.getByRole('button', { name: 'Сезон для просмотра' })).toBeDefined();
  expect(document.querySelector('.media-player-toolbar [aria-label="Выбор серии"]')).toBeNull();
});

test('episode-only Kodik appears and can launch when the root catalog is empty', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, client, catalog } = mount('embed', false, false);
  const scoped = { ...source(1, 1, 'embed'), provider: 'kodik-streaming', label: 'Kodik' };
  catalog.sources = [];
  catalog.episodes = [];
  await act(async () => {
    client.setQueryData(
      mediaEpisodeAvailabilityQueryKey(mediaRef, { seasonNumber: 1, episodeNumber: 1 }),
      { availability: availability([scoped]), settled: true },
    );
    view.rerender(tree());
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Запустить Kodik' })).toBeDefined(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Kodik' }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ sourceRef: scoped.sourceRef }));
  view.rerender(tree());
  await waitFor(() => expect(document.querySelector('iframe')?.src).toBe(scoped.url));
});

test('a conflicting anime season cannot become an episode embed fallback', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, client, catalog } = mount('embed', true, false);
  const wrong = {
    ...source(2, 1, 'embed'),
    label: 'Wrong season',
    episode: {
      seasonNumber: 2,
      episodeNumber: 1,
      absoluteEpisodeNumber: 1,
    },
  };
  catalog.sources = [];
  catalog.episodes = [];
  await act(async () => {
    client.setQueryData(
      mediaEpisodeAvailabilityQueryKey(mediaRef, {
        seasonNumber: 1,
        episodeNumber: 1,
        absoluteEpisodeNumber: 1,
      }),
      { availability: availability([wrong]), settled: true },
    );
    view.rerender(tree());
  });
  expect(screen.queryByRole('button', { name: 'Запустить Wrong season' })).toBeNull();
  expect(document.querySelector('iframe')).toBeNull();
});

test.each([false, true])(
  'a playable episode embed replaces its unsupported generic counterpart (saved session=%s)',
  async (started) => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {}));
    const { view, tree, client, catalog } = mount('embed', false, started);
    const scoped = { ...source(1, 1, 'embed'), sourceRef: 'scoped-kodik', label: 'Kodik' };
    Object.assign(catalog.sources[0]!, { label: 'Kodik', browserSupported: false });
    await act(async () => {
      client.setQueryData(
        mediaEpisodeAvailabilityQueryKey(mediaRef, { seasonNumber: 1, episodeNumber: 1 }),
        { availability: availability([scoped]), settled: true },
      );
      view.rerender(tree());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить Kodik' }));
    view.rerender(tree());
    await waitFor(() => expect(document.querySelector('iframe')?.src).toBe(scoped.url));
  },
);

test('unknown embed validation permits user-initiated iframe loading', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, catalog } = mount('embed', false, false);
  Object.assign(catalog.sources[0]!, { availability: 'unknown', label: 'Turbo' });
  view.rerender(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Turbo' }));
  view.rerender(tree());
  await waitFor(() => expect(document.querySelector('iframe')?.src).toBe(catalog.sources[0]!.url));
});

test('generic Kodik remains the only embed and keeps navigation inside its own player', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, client, catalog } = mount('embed');
  const generic = catalog.sources[0]!;
  Object.assign(generic, {
    provider: 'kodik-streaming',
    label: 'Kodik',
    episode: undefined,
    url: 'about:blank#full-player',
  });
  const scoped = {
    ...generic,
    sourceRef: 'kodik-episode',
    episode: { seasonNumber: 1, episodeNumber: 1 },
    url: 'about:blank#episode',
  };
  await act(async () => {
    client.setQueryData(
      mediaEpisodeAvailabilityQueryKey(mediaRef, { seasonNumber: 1, episodeNumber: 1 }),
      { availability: availability([scoped]), settled: true },
    );
    view.rerender(tree());
  });
  expect(document.querySelector('iframe')?.src).toBe(generic.url);
  expect(document.querySelector('.media-player-frame details')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Kodik', exact: true }));
  expect(
    within(screen.getByRole('region', { name: 'Плееры' })).getAllByRole('button', {
      name: 'Kodik',
      exact: true,
    }),
  ).toHaveLength(1);
  expect(start).not.toHaveBeenCalled();
});

test('embed picker has one named button per provider and opens its full player', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, catalog } = mount('embed', false, false);
  const dub = catalog.sources[0]!;
  Object.assign(dub, { provider: 'alloha-streaming', label: 'Alloha' });
  const full = {
    ...dub,
    sourceRef: 'alloha:main',
    translation: undefined,
    url: 'about:blank#alloha',
  };
  const mirage = {
    ...full,
    sourceRef: 'mirage:main',
    provider: 'mirage-streaming',
    label: 'Mirage',
  };
  const veo = {
    ...full,
    sourceRef: 'veoveo:main',
    provider: 'veoveo-embed',
    label: 'VeoVeo',
    url: 'about:blank#veoveo',
  };
  catalog.sources.push(mirage, veo, full, { ...dub, sourceRef: 'alloha:dub2' });
  view.rerender(tree());
  fireEvent.click(screen.getByRole('button', { name: 'Alloha', exact: true }));
  const panel = within(screen.getByRole('region', { name: 'Плееры' }));
  expect(panel.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Alloha',
    'Mirage',
    'VeoVeo',
  ]);
  const alloha = panel.getByRole('button', { name: 'Alloha', exact: true });
  expect(alloha.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(alloha);
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Alloha', exact: true }));
  view.rerender(tree());
  await waitFor(() => expect(document.querySelector('iframe')?.src).toBe(full.url));
  fireEvent.click(screen.getByRole('button', { name: 'Alloha', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'VeoVeo', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Запустить VeoVeo', exact: true }));
  view.rerender(tree());
  await waitFor(() => expect(document.querySelector('iframe')?.src).toBe(veo.url));
});

test('direct source picker has one button per provider and native tracks stay within that provider', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, catalog, player } = mount();
  for (const item of catalog.episodes[0]!.sources)
    Object.assign(item, { provider: 'videohub-streaming', label: 'VideoHUB' });
  const initial = catalog.episodes[0]!.sources[0]!;
  catalog.episodes[0]!.sources.push(
    { ...initial, sourceRef: 'dub', translation: { title: 'Dub', type: 'dub', language: 'ru' } },
    {
      ...initial,
      sourceRef: 'veo',
      provider: 'veoveo-streaming',
      label: 'VeoVeo',
      kind: 'hls',
      quality: { label: 'Auto Auto' },
      url: 'https://fixture.test/veo.m3u8',
    },
    { ...initial, sourceRef: 'ani', provider: 'aniliberty-streaming', label: 'AniLiberty' },
  );
  await act(async () => view.rerender(tree()));
  const original = player();
  expect(original.descriptor.audioTracks.map((t: any) => t.label)).toEqual(['Original', 'Dub']);
  fireEvent.click(screen.getByRole('button', { name: 'VideoHUB', exact: true }));
  const direct = within(screen.getByRole('region', { name: 'Прямое видео' }));
  expect(direct.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
    'VideoHUB',
    'VeoVeo',
    'AniLiberty',
  ]);
  expect(direct.queryByText('Качество')).toBeNull();
  expect(direct.queryByText('Original')).toBeNull();
  fireEvent.click(direct.getByRole('button', { name: 'VeoVeo', exact: true }));
  expect(player()).toBe(original);
  expect(player().descriptor.audioTracks).toHaveLength(1);
  expect(player().descriptor.capabilities).toMatchObject({
    audio: 'transport',
    quality: 'transport',
  });
  expect(player().descriptor.qualities.map((q: any) => q.label)).toEqual(['Авто']);
});

test('progressive track discovery refreshes native choices without losing position or pause', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { view, tree, catalog, player } = mount();
  const original = player();
  original.runtime = {
    getSnapshot: () => ({ positionSeconds: 81, intent: 'paused', pending: null }),
  };
  const calls = original.setSource.mock.calls.length;
  catalog.episodes[0]!.sources.push({
    ...source(1, 1),
    sourceRef: 'new-dub',
    translation: { title: 'New dub', type: 'dub' },
  });
  await act(async () => view.rerender(tree()));
  expect(player()).toBe(original);
  expect(original.setSource.mock.calls.length).toBe(calls + 1);
  expect(original.options).toMatchObject({ positionSeconds: 81, intent: 'paused' });
  expect(original.descriptor.audioTracks.map((track: any) => track.label)).toEqual([
    'Original',
    'New dub',
  ]);
  await act(async () => view.rerender(tree()));
  expect(original.setSource.mock.calls.length).toBe(calls + 1);
});

test('restored playback waits for the confirmed episode URL instead of loading a catalog redirect', async () => {
  let release!: (value: Response) => void;
  globalThis.fetch = mock(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const { player } = mount('mp4', false, true, false);
  expect(player()).toBeNull();
  const resolved = { ...source(1, 1), url: 'https://cdn.fixture.test/resolved.mp4' };
  await act(async () => release(response([resolved])));
  await waitFor(() => expect(player()?.descriptor.src).toBe(resolved.url));
  expect(player().setSource).toHaveBeenCalledTimes(1);
  expect(player().options).toMatchObject({ positionSeconds: 67, intent: 'paused' });
});

test('an unresolved episode reports lookup failure and retries without loading the catalog URL', async () => {
  globalThis.fetch = mock(async () => response());
  const { player } = mount('mp4', false, true, false);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Повторить', exact: true })).toBeDefined(),
  );
  expect(player()).toBeNull();
  const resolved = { ...source(1, 1), url: 'https://cdn.fixture.test/retry.mp4' };
  globalThis.fetch = mock(async () => response([resolved]));
  fireEvent.click(screen.getByRole('button', { name: 'Повторить', exact: true }));
  await waitFor(() => expect(player()?.descriptor.src).toBe(resolved.url));
});

test('resolved provider IDs replace catalog placeholders without losing a restored session', async () => {
  let release!: (value: Response) => void;
  globalThis.fetch = mock(() => new Promise<Response>((resolve) => (release = resolve)));
  const { player } = mount('mp4', false, true, false);
  const resolved = {
    ...source(1, 1),
    sourceRef: 'resolved:1:1:0',
    translation: { title: 'Resolved original', type: 'original' as const },
    url: 'https://cdn.fixture.test/resolved-id.mp4',
  };
  await act(async () => release(response([resolved])));
  await waitFor(() => expect(player()?.descriptor.src).toBe(resolved.url));
  expect(player().options).toMatchObject({ positionSeconds: 67, intent: 'paused' });
  expect(player().descriptor.audioTracks.map((track: any) => track.label)).toEqual([
    'Resolved original',
  ]);
});

test('first Play keeps its provider when resolved IDs replace catalog sources', async () => {
  let release!: (value: Response) => void;
  globalThis.fetch = mock(() => new Promise<Response>((resolve) => (release = resolve)));
  const { player, view, tree, catalog } = mount('mp4', false, false, false);
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Fixture' }));
  expect(player()).toBeNull();
  catalog.episodes[0]!.sources.unshift({
    ...source(1, 1),
    sourceRef: 'another:1:1',
    provider: 'another-provider',
    label: 'Another',
  });
  await act(async () => view.rerender(tree()));
  const resolved = {
    ...source(1, 1),
    sourceRef: 'resolved:1:1:0',
    url: 'https://cdn.fixture.test/first-play.mp4',
  };
  await act(async () => release(response([resolved])));
  await waitFor(() => expect(player()?.descriptor.src).toBe(resolved.url));
  expect(player().options).toMatchObject({ positionSeconds: 0, intent: 'playing' });
});

test('before playback and after a fatal error no separate episode overlay appears', async () => {
  globalThis.fetch = mock(() => new Promise<Response>(() => {}));
  const { player } = mount('mp4', false, false);
  expect(document.querySelector('.media-player-frame details')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Fixture' }));
  const original = player();
  expect(original.navigation.seasons).toHaveLength(2);
  await act(async () =>
    original.dispatchEvent(
      new CustomEvent('yp-error', {
        detail: {
          source: { id: original.descriptor.id, revision: original.descriptor.revision },
          snapshot: { playback: 'error' },
        },
      }),
    ),
  );
  expect(player()).toBeNull();
  expect(document.querySelector('.media-player-frame details')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить', exact: true }));
  expect(player()).not.toBeNull();
});

test('late history cannot replace an explicitly selected native episode', async () => {
  globalThis.fetch = mock(async () => response([source(1, 2)]));
  const { view, tree, player } = mount();
  await act(async () => {
    await player().navigation.select(
      { seasonId: '1', episodeId: 'season:1:episode:2' },
      { signal: new AbortController().signal },
    );
  });
  await act(async () => {
    playback = {
      ...playback,
      session: null,
      continueWatchingEntries: [
        {
          mediaRef,
          sourceRef: 'mp4:1:1',
          episode: { seasonNumber: 1, episodeNumber: 1 },
          positionSeconds: 95,
        },
      ],
    };
    view.rerender(tree());
  });
  fireEvent.click(screen.getByRole('button', { name: 'Запустить Fixture' }));
  expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
    sourceRef: 'mp4:1:2',
    positionSeconds: 0,
    episode: { episodeNumber: 2 },
  });
});
