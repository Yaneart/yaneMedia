import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
mock.module('../src/widgets/media-player/ui/MediaVideoRenderer', () => ({
  MediaVideoRenderer: () => <div />,
}));
const { act } = await import('react');
const { cleanup, render } = await import('@testing-library/react');
const { MediaPlayer } = await import('../src/widgets/media-player/ui/MediaPlayer');
const originalMatchMedia = window.matchMedia;
const originalObserver = globalThis.ResizeObserver;
const noop = () => {};

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.matchMedia = originalMatchMedia;
  globalThis.ResizeObserver = originalObserver;
});
afterAll(() => GlobalRegistrator.unregister());

function mount(desktop = true) {
  let resize = noop;
  let breakpoint = noop;
  const query = {
    matches: desktop,
    addEventListener: (_: string, listener: () => void) => {
      breakpoint = listener;
    },
    removeEventListener: mock(),
  };
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  const disconnect = mock();
  const observe = mock();
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      resize = callback;
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = noop;
  } as unknown as typeof ResizeObserver;
  const main = document.createElement('main');
  const frame = document.createElement('div');
  frame.className = 'media-player-frame';
  const toolbar = document.createElement('div');
  const container = document.createElement('div');
  frame.append(toolbar, container);
  main.append(frame);
  document.body.append(main);
  main.scrollTop = 140;
  const scroll = mock();
  main.scrollTo = scroll;
  Object.defineProperty(main, 'clientHeight', { value: 900, configurable: true });
  Object.defineProperty(frame, 'clientWidth', { value: 1200 });
  toolbar.getBoundingClientRect = () => ({ height: 64 }) as DOMRect;
  main.getBoundingClientRect = () => ({ top: 16 }) as DOMRect;
  frame.getBoundingClientRect = () => ({ top: 240 }) as DOMRect;
  const props = {
    mediaTitle: 'Fixture',
    source: {
      sourceRef: 'fixture',
      provider: 'fixture',
      label: 'Fixture',
      kind: 'mp4' as const,
      url: 'https://fixture.test/video.mp4',
      availability: 'available' as const,
      browserSupported: true,
    },
    isStarted: true,
    shouldAutoPlay: false,
    initialPositionSeconds: 0,
    status: 'ready' as const,
    onStart: noop,
    onReady: noop,
    onError: noop,
    onPlay: noop,
    onPause: noop,
    onProgress: noop,
  };
  const view = render(<MediaPlayer {...props} />, { container });
  const section = container.querySelector('section')!;
  const theater = (value: boolean, beforeCommit = noop) =>
    act(() => {
      section.dispatchEvent(new CustomEvent('yp-theaterchange', { detail: { theater: value } }));
      beforeCommit();
    });
  return {
    main,
    frame,
    section,
    scroll,
    resize: () => resize(),
    query,
    breakpoint: () => breakpoint(),
    disconnect,
    observe,
    theater,
    view,
    props,
  };
}

test('theater fits the viewport, allows scrolling after resize and restores the previous position', () => {
  const fixture = mount();
  fixture.theater(true);
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('675px');
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 364, behavior: 'instant' });
  expect(fixture.observe).toHaveBeenCalledWith(fixture.frame);
  Object.defineProperty(fixture.main, 'clientHeight', { value: 500 });
  fixture.resize();
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('500px');
  expect(fixture.scroll).toHaveBeenCalledTimes(1);
  fixture.theater(false);
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 140, behavior: 'instant' });
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('');
  expect(fixture.disconnect).toHaveBeenCalledTimes(1);
  expect(fixture.query.removeEventListener).toHaveBeenCalledTimes(1);
});

test('narrow and touch layouts keep their scroll and only align when desktop theater becomes active', () => {
  const fixture = mount(false);
  fixture.theater(true);
  expect(fixture.scroll).not.toHaveBeenCalled();
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('');
  fixture.query.matches = true;
  fixture.breakpoint();
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('675px');
  fixture.query.matches = false;
  fixture.breakpoint();
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 140, behavior: 'instant' });
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('');
});

test('restoration remembers the position before layout changes trigger browser scroll anchoring', () => {
  const fixture = mount();
  fixture.theater(true, () => {
    fixture.main.scrollTop = 80;
  });
  fixture.theater(false);
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 140, behavior: 'instant' });
});

test('playback errors and unmount release theater sizing and restore scrolling', () => {
  const fixture = mount();
  fixture.theater(true);
  fixture.view.rerender(<MediaPlayer {...fixture.props} status="error" />);
  expect(fixture.section.classList.contains('media-player-theater')).toBe(false);
  expect(fixture.section.style.getPropertyValue('--media-theater-height')).toBe('');
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 140, behavior: 'instant' });
  fixture.view.rerender(<MediaPlayer {...fixture.props} />);
  fixture.theater(true);
  fixture.view.unmount();
  expect(fixture.disconnect).toHaveBeenCalledTimes(2);
  expect(fixture.scroll).toHaveBeenLastCalledWith({ top: 140, behavior: 'instant' });
});
