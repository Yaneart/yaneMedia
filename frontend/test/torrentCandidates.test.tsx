import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { TorrentCandidate } from '../src/entities/torrent-session';

GlobalRegistrator.register();
const { render, cleanup, fireEvent, waitFor, act } = await import('@testing-library/react');
const { TorrentCandidatesPanel } =
  await import('../src/features/torrent-launch/ui/TorrentCandidatesPanel');
const pool: TorrentCandidate[] = Array.from({ length: 353 }, (_, i) => ({
  candidateRef: `candidate_${i.toString().padStart(24, '0')}`,
  title: `Release ${i.toString().padStart(3, '0')}`,
  tracker: i === 352 ? 'Rare source' : 'Rutor',
  stale: false,
  size: 1024,
  seeders: i + 1,
  publishedAt: new Date(Date.UTC(2020, 0, i + 1)).toISOString(),
  score: 353 - i,
  reasons: [],
  quality: 'WEB-DL',
  resolution: '1080p',
  voice: null,
  studio: null,
  russianSubtitles: false,
  season: null,
  episode: null,
}));

// Happy DOM supplies no layout. Exercise the actual virtualizer with variable row sizes.
const rowHeight = (element: HTMLElement) =>
  element.getAttribute('role') === 'listitem'
    ? Number(element.dataset.index ?? 0) % 3 === 0
      ? 210
      : 130
    : 400;
Object.defineProperties(HTMLElement.prototype, {
  clientWidth: { configurable: true, get: () => 600 },
  clientHeight: { configurable: true, get: () => 400 },
  offsetWidth: { configurable: true, get: () => 600 },
  offsetHeight: {
    configurable: true,
    get() {
      return rowHeight(this);
    },
  },
  scrollHeight: { configurable: true, get: () => 100_000 },
});
HTMLElement.prototype.getBoundingClientRect = function () {
  const owner = this.closest<HTMLElement>('[data-testid="source-menu"]');
  const top = this.hasAttribute('data-virtual-candidates') ? 240 - (owner?.scrollTop ?? 0) : 0;
  return {
    x: 0,
    y: 0,
    top,
    left: 0,
    right: 600,
    bottom: top + rowHeight(this),
    width: 600,
    height: rowHeight(this),
    toJSON() {},
  };
};
HTMLElement.prototype.getClientRects = function () {
  return [this.getBoundingClientRect()] as unknown as DOMRectList;
};
HTMLElement.prototype.scrollTo = function (options: ScrollToOptions | number) {
  if (typeof options === 'object') this.scrollTop = options.top ?? this.scrollTop;
  this.dispatchEvent(new Event('scroll'));
};

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());
function mount(candidates = pool) {
  const select = mock(() => {}),
    refresh = mock(() => {});
  const view = render(
    <div data-testid="source-menu" style={{ height: 400, overflowY: 'auto' }}>
      <div>
        <TorrentCandidatesPanel
          query={{
            data: { candidates, degraded: false, expiresAt: Date.now() + 60000 },
            isPending: false,
            isFetching: false,
            isError: false,
          }}
          pending={false}
          onRefresh={refresh}
          onSelect={select}
        />
        <button>After list</button>
      </div>
    </div>,
  );
  return { ...view, select, refresh };
}

test('hides zero-seeder cached entries and their filter options while retaining unknown counts', () => {
  const view = mount([
    ...pool,
    {
      ...pool[0],
      candidateRef: 'candidate_dead',
      title: 'Dead release',
      tracker: 'Dead source',
      score: 10000,
      seeders: 0,
    },
    {
      ...pool[0],
      candidateRef: 'candidate_unknown',
      title: 'Unknown release',
      score: 9000,
      seeders: null,
    },
  ]);
  expect(view.getByText('Показано 100 из 354 · Лучшие')).toBeDefined();
  expect(view.queryByRole('button', { name: /Dead release/ })).toBeNull();
  expect(view.getByRole('button', { name: /Unknown release/ })).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Источник раздачи', exact: true }));
  expect(view.queryByRole('option', { name: /Dead source/ })).toBeNull();
});

test('virtualizes only the first 100 and reselects them from the full pool on date, seeders and tracker changes', async () => {
  const view = mount();
  expect(view.getByText('Показано 100 из 353 · Лучшие')).toBeDefined();
  expect(view.queryByRole('button', { name: 'Подбор раздач' })).toBeNull();
  expect(
    view.container
      .querySelector('[data-virtual-candidates]')
      ?.getAttribute('data-virtual-candidates'),
  ).toBe('100');
  expect(view.getAllByRole('listitem').length).toBeLessThan(20);
  expect(view.queryByRole('button', { name: /Release 352/ })).toBeNull();
  for (const label of ['Сначала новые', 'Больше раздающих']) {
    fireEvent.click(view.getByRole('button', { name: 'Сортировка', exact: true }));
    fireEvent.click(view.getByRole('option', { name: label }));
    await view.findByRole('button', { name: /Release 352/ });
    expect(view.getAllByRole('listitem').length).toBeLessThan(20);
  }
  fireEvent.click(view.getByRole('button', { name: 'Источник раздачи', exact: true }));
  fireEvent.click(view.getByRole('option', { name: 'Rare source (1)' }));
  expect(view.getByText('Показано 1 из 1 · Всего 353 · Больше раздающих')).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: /Release 352/ }));
  expect(view.select).toHaveBeenCalledWith(pool[352]);
  expect(view.refresh).not.toHaveBeenCalled();
});

test('scrolls to the last displayed release with bounded DOM and keeps keyboard navigation across unmounted rows', async () => {
  const view = mount();
  const list = view.getByRole('list', { name: 'Раздачи' });
  const owner = view.getByTestId('source-menu');
  expect(getComputedStyle(owner).overflowY).toBe('auto');
  expect(['auto', 'scroll']).not.toContain(getComputedStyle(list).overflowY);
  expect(list.style.maxHeight).toBe('');
  let intercepted = 0;
  for (let index = 0; index < 15; index++) {
    const button = await view.findByRole('button', {
      name: new RegExp(`Release ${String(index).padStart(3, '0')}`),
    });
    act(() => button.focus());
    const next = `Release ${String(index + 1).padStart(3, '0')}`;
    if (fireEvent.keyDown(button, { key: 'Tab' })) {
      // Synthetic key events have no browser Tab default action.
      act(() => view.getByRole('button', { name: new RegExp(next) }).focus());
    } else {
      intercepted++;
      await waitFor(() => expect(document.activeElement?.textContent).toContain(next));
    }
  }
  expect(intercepted).toBeGreaterThan(0);
  await waitFor(() => expect(document.activeElement?.textContent).toContain('Release 015'));
  owner.scrollTop = 240 + parseFloat((list.firstElementChild as HTMLElement).style.height) - 400;
  fireEvent.scroll(owner);
  await view.findByRole('button', { name: /Release 099/ });
  expect(view.queryByRole('button', { name: /Release 100/ })).toBeNull();
  expect(view.getAllByRole('listitem').length).toBeLessThan(20);
  fireEvent.click(view.getByRole('button', { name: 'Сортировка', exact: true }));
  fireEvent.click(view.getByRole('option', { name: 'Больше раздающих' }));
  await view.findByRole('button', { name: /Release 352/ });
  expect(owner.scrollTop).toBe(0);
  expect(view.getByRole('list', { name: 'Раздачи' }).scrollTop).toBe(0);
});
