import { afterAll, afterEach, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { TorrentPreparation } = await import('../src/features/torrent-launch/ui/TorrentPreparation');
const { PlaybackSourcePicker } =
  await import('../src/features/source-selection/ui/PlaybackSourcePicker');
const originalNow = Date.now;

afterEach(() => {
  cleanup();
  Date.now = originalNow;
});
afterAll(() => GlobalRegistrator.unregister());

test('preparation starts empty, advances through stages without regressing and completes only when ready', async () => {
  const view = render(<TorrentPreparation state="probing" />);
  const bar = screen.getByRole('progressbar', { name: 'Подготовка торрента' });
  expect(bar.getAttribute('aria-valuenow')).toBe('0');
  await waitFor(() => expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0));
  view.rerender(<TorrentPreparation state="preparing" />);
  await waitFor(() => expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(70));
  const previous = Number(bar.getAttribute('aria-valuenow'));
  view.rerender(<TorrentPreparation state="fetching_metadata" />);
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(previous);
  expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
  view.rerender(<TorrentPreparation state="ready" />);
  expect(bar.getAttribute('aria-valuenow')).toBe('100');
  expect(screen.getByText('100%')).toBeDefined();
  expect(bar.querySelector('[style]')?.getAttribute('style')).toContain('inset(-0.1em 0%');
  view.rerender(<TorrentPreparation key="retry" state="created" />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
});

test('a stalled preparation stays below 100 even after a long wait', async () => {
  const started = Date.now();
  render(<TorrentPreparation state="preparing" />);
  Date.now = () => started + 3_600_000;
  await waitFor(() =>
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('95'),
  );
  expect(screen.queryByText('100%')).toBeNull();
});

test('the streaming-provider loading status is hidden only while browsing torrents', () => {
  render(
    <PlaybackSourcePicker
      embedSources={[]}
      directSources={[]}
      onEmbedSelect={() => {}}
      onDirectSelect={() => {}}
      isLoading
      torrentPanel={() => <div>Раздачи</div>}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Источник' }));
  expect(screen.getByText('Ищем ещё варианты')).toBeDefined();
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  expect(screen.queryByText('Ищем ещё варианты')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Прямое видео' }));
  expect(screen.getByText('Ищем ещё варианты')).toBeDefined();
});
