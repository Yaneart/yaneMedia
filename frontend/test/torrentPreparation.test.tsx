import { afterAll, afterEach, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();
const { render, screen, cleanup } = await import('@testing-library/react');
const { TorrentPreparation } = await import('../src/features/torrent-launch/ui/TorrentPreparation');
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

test('confirmed preparation stages advance immediately and a fresh attempt starts at zero', () => {
  const view = render(<TorrentPreparation key={1} state="fetching_metadata" />);
  const percent = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
  expect(percent()).toBe(12);
  view.rerender(<TorrentPreparation key={1} state="awaiting_file" />);
  expect(percent()).toBe(30);
  view.rerender(<TorrentPreparation key={1} state="probing" />);
  expect(percent()).toBe(38);
  view.rerender(<TorrentPreparation key={1} state="preparing" />);
  expect(percent()).toBe(70);
  view.rerender(<TorrentPreparation key={1} state="ready" />);
  expect(percent()).toBe(100);
  view.rerender(<TorrentPreparation key={2} state="created" />);
  expect(percent()).toBe(0);
});
