import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
const { cleanup, render } = await import('@testing-library/react');
const { ReleasePosterOverlay } = await import('../src/pages/releases/ReleasePosterOverlay');
const { formatReleaseDate } = await import('../src/pages/releases/releasePresentation');
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe('release cards', () => {
  test('leaves released standalone posters free of release labels', () => {
    const { container } = render(
      <ReleasePosterOverlay upcoming={false} releaseDate="2026-11-20" />,
    );
    expect(container.textContent).toBe('');
  });
  test('puts a precise premiere date over a darkened upcoming poster', () => {
    const { container, getByText } = render(
      <ReleasePosterOverlay upcoming releaseDate="2027-02" />,
    );
    expect(getByText('Скоро на экране')).toBeTruthy();
    expect(container.querySelector('time')?.dateTime).toBe('2027-02');
    expect(container.textContent).toContain('февраль');
    expect(container.firstElementChild?.className).toContain('absolute inset-0');
  });
  test('shows episode dates only for current releases', () => {
    const { container } = render(
      <ReleasePosterOverlay upcoming={false} nextEpisodeAt="2027-02-09" ongoing />,
    );
    expect(container.textContent).toContain('Новая серия');
    expect(container.querySelector('time')?.dateTime).toBe('2027-02-09');
  });
  test('does not invent a precise release date', () => {
    expect(formatReleaseDate('2027')).toBe('2027 год');
    expect(formatReleaseDate(undefined)).toBe('Дата уточняется');
    expect(formatReleaseDate('bad-date')).toBe('Дата уточняется');
  });
});
