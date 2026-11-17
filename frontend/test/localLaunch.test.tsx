import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { render, cleanup, fireEvent, screen, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const connection = { state: { status: 'saved', hasPairing: true } };
mock.module('@/features/companion', () => ({
  useCompanionConnection: () => connection,
  CompanionDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Companion settings</div> : null,
}));
const { LocalTorrentLaunch } = await import('../src/features/torrent-launch/ui/LocalTorrentLaunch');
const originalFetch = globalThis.fetch;
const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
let client: InstanceType<typeof QueryClient>;
let calls: string[];
let start: ReturnType<typeof mock>;
let local: any;
const candidates = [1080, 720, 2160].map((resolution, index) => ({
  candidateRef: `candidate_${String(index).repeat(24)}`,
  title: `Fixture ${resolution}`,
  tracker: index ? 'Knaben' : 'RuTracker.org',
  stale: false,
  size: 1024,
  seeders: index === 2 ? 0 : 20 + index,
  publishedAt: null,
  score: 100 - index,
  reasons: [],
  quality: 'WEB-DL',
  resolution: `${resolution}p`,
  voice: 'DUB',
  studio: null,
  russianSubtitles: false,
  season: null,
  episode: null,
}));
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  calls = [];
  start = mock(async () => {});
  local = { start, pending: false, snapshot: null, playback: null, error: null };
  connection.state.hasPairing = true;
  globalThis.fetch = mock(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path.endsWith('/candidates'))
      return Response.json({
        data: { mediaRef, candidates, degraded: false, expiresInSeconds: 300 },
      });
    if (path.endsWith('/resolve'))
      return Response.json({
        data: {
          locator: { kind: 'magnet', value: 'magnet:?xt=urn:btih:' + 'a'.repeat(40) },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    throw new Error('Unexpected ' + init?.method + ' ' + path);
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  client.clear();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());
function mount(open = true) {
  const tree = (visible: boolean) => (
    <QueryClientProvider client={client}>
      <AuthContext
        value={{
          state: { status: 'guest', user: null },
          setAuthenticated: () => {},
          setGuest: () => {},
          refresh: async () => {},
        }}
      >
        <LocalTorrentLaunch mediaRef={mediaRef} open={visible} local={local} onStart={() => {}} />
      </AuthContext>
    </QueryClientProvider>
  );
  const view = render(tree(open));
  return { ...view, update: (visible = true) => view.rerender(tree(visible)) };
}

test('Public searches on opening and uses the Home filters, reset, refresh and collapsed manual form', async () => {
  const view = mount(false);
  expect(calls).toHaveLength(0);
  view.update();
  await screen.findByRole('button', { name: /Fixture 1080/ });
  expect(calls).toHaveLength(1);
  const button = screen.getByRole('button', { name: 'yaneCompanion', exact: true });
  const heading = screen.getByRole('heading', { name: 'Найденные раздачи' });
  expect(button.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const name of ['Сортировка', 'Источник раздачи', 'Разрешение', 'Качество', 'Озвучка'])
    expect(screen.getByRole('button', { name, exact: true })).toBeDefined();
  expect(screen.getByText('Добавить вручную').closest('details')?.open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Разрешение', exact: true }));
  fireEvent.click(screen.getByRole('option', { name: '720p (1)' }));
  expect(screen.queryByRole('button', { name: /Fixture 1080/ })).toBeNull();
  expect(screen.getByText('Показано 1 из 3 · Лучшие')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Только с раздающими' }));
  expect(screen.queryByRole('button', { name: /Fixture 2160/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
  await waitFor(() => expect(calls).toHaveLength(2));
  fireEvent.click(button);
  expect(screen.getByRole('dialog')).toBeDefined();
});

test('an active local release can be replaced, and unpaired selection opens Companion without starting', async () => {
  local.snapshot = { state: 'ready' };
  local.playback = {};
  const view = mount();
  fireEvent.click(await screen.findByRole('button', { name: /Fixture 1080/ }));
  expect(start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Fixture 720/ }));
  expect(start).toHaveBeenCalledTimes(2);
  expect(calls.some((path) => path.includes('torrent-sessions'))).toBe(false);
  connection.state.hasPairing = false;
  local.snapshot = null;
  view.update();
  fireEvent.click(screen.getByRole('button', { name: /Fixture 2160/ }));
  expect(start).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('dialog')).toBeDefined();
});

test('manual launch trims magnet input, validates files and uses the same source selector as Home', async () => {
  mount();
  await screen.findByRole('button', { name: /Fixture 1080/ });
  fireEvent.click(screen.getByText('Добавить вручную'));
  const submit = screen.getByRole('button', { name: 'Запустить', exact: true });
  fireEvent.click(submit);
  expect(screen.getByRole('alert').textContent).toContain('Введите magnet');
  fireEvent.change(screen.getByRole('textbox', { name: 'Magnet-ссылка' }), {
    target: { value: '  magnet:?xt=urn:btih:' + 'a'.repeat(40) + '  ' },
  });
  fireEvent.click(submit);
  expect(start).toHaveBeenCalledTimes(1);
  await expect(start.mock.calls[0][0](new AbortController().signal)).resolves.toEqual({
    kind: 'magnet',
    value: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Файл .torrent' }));
  fireEvent.click(submit);
  expect(screen.getByRole('alert').textContent).toContain('Выберите файл .torrent');
  expect(start).toHaveBeenCalledTimes(1);
});

test('another release and manual input remain available while Public prepares a torrent', async () => {
  local.pending = true;
  mount();
  const first = await screen.findByRole('button', { name: /Fixture 1080/ });
  expect((first as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(first);
  expect(start).toHaveBeenCalledTimes(1);
  fireEvent.click(first);
  expect(start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Fixture 720/ }));
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('Добавить вручную'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Magnet-ссылка' }), {
    target: { value: 'magnet:?xt=urn:btih:' + 'a'.repeat(40) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Запустить', exact: true }));
  expect(start).toHaveBeenCalledTimes(3);
});
