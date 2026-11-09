import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'https://watch.example' });
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
let state: any;
const cancel = mock(() => {});
mock.module('@/features/companion', () => ({
  useCompanionConnection: () => ({ state, cancel }),
  CompanionDialog: ({ open, onClose }: any) =>
    open ? (
      <div role="dialog">
        <button onClick={onClose}>Закрыть подключение</button>
      </div>
    ) : null,
}));
const { LocalTorrentLaunch } = await import('../src/features/torrent-launch/ui/LocalTorrentLaunch');
const start = mock(async (_resolve: any) => {});
const onStart = mock(() => {});
const local: any = { start, pending: false, snapshot: null };
let query: InstanceType<typeof QueryClient>;
function fixture(mediaRef = 'film', auth: any = { status: 'guest' }) {
  return (
    <QueryClientProvider client={query}>
      <AuthContext.Provider value={{ state: auth } as any}>
        <LocalTorrentLaunch
          mediaRef={mediaRef}
          local={local}
          onStart={onStart}
          onSelect={() => {}}
          onStop={() => {}}
        />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
function selectMagnet() {
  fireEvent.change(screen.getByLabelText('Magnet-ссылка'), {
    target: { value: 'magnet:?xt=urn:btih:abc' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить локально' }));
}
beforeEach(() => {
  state = { status: 'idle', hasPairing: false };
  start.mockClear();
  onStart.mockClear();
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  query.clear();
});
afterAll(() => GlobalRegistrator.unregister());

test('first torrent waits for local approval and continues once after pairing', async () => {
  const view = render(fixture());
  selectMagnet();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
  expect(onStart).not.toHaveBeenCalled();
  state = { status: 'paired', hasPairing: true, playbackReady: true };
  view.rerender(fixture());
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(await (start.mock.calls[0]![0] as any)(new AbortController().signal)).toEqual({
    kind: 'magnet',
    value: 'magnet:?xt=urn:btih:abc',
  });
  view.rerender(fixture());
  expect(start).toHaveBeenCalledTimes(1);
});

test('closing connection discards the selected torrent', () => {
  const view = render(fixture());
  selectMagnet();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть подключение' }));
  state = { status: 'paired', hasPairing: true, playbackReady: true };
  view.rerender(fixture());
  expect(start).not.toHaveBeenCalled();
});

test('a pending torrent cannot cross media or account boundaries on late approval', () => {
  const view = render(fixture());
  selectMagnet();
  state = { status: 'paired', hasPairing: true, playbackReady: true };
  view.rerender(
    fixture('other-film', { status: 'authenticated', user: { email: 'user@example.com' } }),
  );
  expect(start).not.toHaveBeenCalled();
});

test('a saved pairing launches without requesting a fresh code', () => {
  state = { status: 'saved', hasPairing: true };
  render(fixture());
  selectMagnet();
  expect(start).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});
