import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
const { cleanup, render } = await import('@testing-library/react');
const { ReleasePosterOverlay } = await import('../src/pages/releases/ReleasePosterOverlay');
const { formatReleaseDate } = await import('../src/pages/releases/releasePresentation');
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe('release cards', () => {
  test('puts a precise premiere date over a darkened upcoming poster', () => {
    const { container, getByText } = render(<ReleasePosterOverlay date="2027-02" />);
    expect(getByText('Скоро на экране')).toBeTruthy();
    expect(container.querySelector('time')?.dateTime).toBe('2027-02');
    expect(container.textContent).toContain('февраль');
    expect(container.firstElementChild?.className).toContain('absolute inset-0');
  });
  test('displays the next episode with the same poster layout as a premiere', () => {
    const { container, getByText } = render(
      <ReleasePosterOverlay date="2027-02-08T21:30:00Z" kind="episode" />,
    );
    expect(getByText('Новая серия')).toBeTruthy();
    expect(container.querySelector('time')?.dateTime).toBe('2027-02-08T21:30:00Z');
    expect(container.querySelector('time')?.textContent).toContain('9 февраля');
    expect(container.firstElementChild?.className).toContain('absolute inset-0');
  });
  test('labels a dated calendar premiere', () => {
    const { container, getByText } = render(
      <ReleasePosterOverlay date="2027-02-09" kind="premiere" />,
    );
    expect(getByText('Премьера')).toBeTruthy();
    expect(container.querySelector('time')?.textContent).toContain('9 февраля');
  });
  test('does not invent a precise release date', () => {
    expect(formatReleaseDate('2027')).toBe('2027 год');
    expect(formatReleaseDate(undefined)).toBe('Дата уточняется');
    expect(formatReleaseDate('bad-date')).toBe('Дата уточняется');
  });
});
