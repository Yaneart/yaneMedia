import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { MediaDetails } from '../src/entities/media/model/media';

// Run in its own Bun process: the page test isolates peripheral modules.
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act } = await import('react');
const { render, cleanup, fireEvent, screen, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryObserver } = await import('@tanstack/react-query');
const { MediaInfo } = await import('../src/widgets/media-info/ui/MediaInfo');
const { mediaDetailsQueryOptions } = await import('../src/entities/media/model/mediaDetailsQuery');
const originalFetch = globalThis.fetch;
const media: MediaDetails = {
  mediaRef: 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60' as MediaDetails['mediaRef'],
  slug: 'fixture',
  type: 'movie',
  title: 'Произведение',
  year: 2024,
  runtimeMinutes: 120,
  description: 'Описание произведения',
  genres: ['Драма'],
  poster: { url: 'https://images.example.test/poster.jpg' },
  countries: [],
  languages: [],
  persons: [],
};

afterEach(() => {
  cleanup();
  mock.restore();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  GlobalRegistrator.unregister();
});

test('fallback-only people and countries do not change the visible metadata', () => {
  const view = render(<MediaInfo media={media} variant="watch" />);
  const primaryMarkup = view.container.innerHTML;
  view.rerender(
    <MediaInfo
      variant="watch"
      media={{
        ...media,
        countries: ['United States'],
        persons: [
          { name: 'Fallback director', roles: ['director'] },
          { name: 'Fallback actor', roles: ['actor'] },
        ],
      }}
    />,
  );
  expect(view.container.innerHTML).toBe(primaryMarkup);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(media.title);
  expect(screen.getAllByText('Драма').length).toBeGreaterThan(0);
});

test('failed poster retries on reconnect and accepts a new URL immediately', () => {
  const view = render(<MediaInfo media={media} variant="watch" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent(window, new Event('online'));
  expect(screen.getByRole('img').getAttribute('src')).toBe(media.poster!.url);
  fireEvent.error(screen.getByRole('img'));
  view.rerender(
    <MediaInfo
      media={{ ...media, poster: { url: 'https://images.example.test/recovered.jpg' } }}
      variant="watch"
    />,
  );
  expect(screen.getByRole('img').getAttribute('src')).toEndWith('/recovered.jpg');
});

test('failed poster retries after ten seconds without a reconnect event', () => {
  let retry: (() => void) | undefined;
  const originalSetTimeout = window.setTimeout.bind(window);
  spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
    if (delay === 10_000 && typeof handler === 'function') retry = () => handler(...args);
    return originalSetTimeout(handler, delay, ...args);
  });
  render(<MediaInfo media={media} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(retry).toBeFunction();
  act(() => retry!());
  expect(screen.getByRole('img').getAttribute('src')).toBe(media.poster!.url);
});

test('degraded details refresh in the background and stop polling after primary recovery', async () => {
  const originalSetInterval = globalThis.setInterval;
  spyOn(globalThis, 'setInterval').mockImplementation((handler, delay, ...args) =>
    originalSetInterval(handler, delay === 30_000 ? 5 : delay, ...args),
  );
  let requests = 0;
  globalThis.fetch = mock(async () => {
    requests++;
    return Response.json({ data: { details: media, degraded: requests === 1 } });
  }) as typeof fetch;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const options = mediaDetailsQueryOptions(media.slug);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    await waitFor(() => expect(observer.getCurrentResult().data?.degraded).toBe(false));
    expect(requests).toBe(2);
    expect(observer.getCurrentResult().isStale).toBe(false);
    await client.fetchQuery(options);
    expect(requests).toBe(2);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test('degraded metadata and refresh errors stay quiet while the mounted view recovers', async () => {
  const noop = () => {};
  mock.module('@/entities/auth', () => ({ useAuth: () => ({ state: { status: 'guest' } }) }));
  mock.module('@/features/opening-history', () => ({
    useOpeningHistory: () => ({ recordOpening: noop }),
  }));
  mock.module('@/pages/media/model/useMediaAvailability', () => ({
    useMediaAvailability: () => ({ availability: null, isPending: false, status: 'success' }),
  }));
  mock.module('@/pages/media/ui/MediaView', () => ({
    MediaView: () => <video data-testid="player" />,
  }));
  const { QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter, Routes, Route } = await import('react-router');
  const { MediaPage } = await import('../src/pages/media/ui/MediaPage');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const options = mediaDetailsQueryOptions(media.slug);
  client.setQueryData(options.queryKey, { details: media, degraded: true, animeSeasonChain: [] });
  let requests = 0;
  globalThis.fetch = mock(async () => {
    requests++;
    return requests === 1
      ? Response.json({ error: { message: 'Unavailable' } }, { status: 503 })
      : Response.json({ data: { details: media, degraded: false } });
  }) as typeof fetch;
  try {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/media/fixture']}>
          <Routes>
            <Route path="/media/:mediaRef" element={<MediaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const player = screen.getByTestId('player');
    await waitFor(() => expect(client.getQueryState(options.queryKey)?.status).toBe('error'));
    expect(screen.queryByText(/информация.*неполной|Не удалось обновить информацию/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Обновить' })).toBeNull();
    expect(screen.getByTestId('player')).toBe(player);
    await act(() => client.refetchQueries({ queryKey: options.queryKey }));
    await waitFor(() =>
      expect(client.getQueryData<{ degraded: boolean }>(options.queryKey)?.degraded).toBe(false),
    );
    expect(requests).toBe(2);
    expect(screen.getByTestId('player')).toBe(player);
  } finally {
    cleanup();
    client.clear();
  }
});
