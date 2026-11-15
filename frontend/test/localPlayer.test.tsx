import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act, useState } = await import('react');
const { render, cleanup, screen, waitFor } = await import('@testing-library/react');
let settle!: () => void;
let player: FakePlayer;
class FakePlayer extends HTMLElement {
  descriptor: any;
  options: any;
  snapshot: any;
  runtime = { getSnapshot: () => this.snapshot };
  setSource = mock((descriptor: any, options: any) => {
    this.descriptor = descriptor;
    this.options = options;
    return new Promise<void>((resolve) => {
      settle = resolve;
    });
  });
  selectAudio = mock(async () => {});
  selectText = mock(async (_id: string) => {});
  emit(playback: string, pending: any = null) {
    this.snapshot = {
      source: { id: this.descriptor.id, revision: this.descriptor.revision },
      playback,
      intent: 'playing',
      pending,
      positionSeconds: 43,
      durationSeconds: 192,
      selection: { audioId: 'b'.repeat(64), textId: null },
      captions: { status: pending ? 'loading' : 'error' },
    };
    this.dispatchEvent(
      new CustomEvent('yp-statechange', {
        detail: { source: this.snapshot.source, snapshot: this.snapshot },
      }),
    );
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
const { MediaPlayer } = await import('../src/widgets/media-player/ui/MediaPlayer');
afterEach(() => cleanup());
afterAll(() => GlobalRegistrator.unregister());

test('local video releases the loading overlay while initial subtitles are still pending and keeps progress unconfirmed', async () => {
  const progress = mock(() => {}),
    pause = mock(() => {}),
    ready = mock(() => {}),
    error = mock(() => {});
  const source: any = {
    id: 'local-fixture',
    revision: 1,
    type: 'hls',
    url: `http://127.0.0.1:45723/v1/media/${'a'.repeat(64)}/master.m3u8`,
    audioTracks: [],
    textTracks: [],
    timeline: {
      mode: 'windowed-vod',
      continuous: true,
      absoluteAnchorSeconds: 42,
      mediaAnchorSeconds: 0,
      durationSeconds: 192,
    },
  };
  const binding: any = {
    source,
    position: 42,
    audioId: 'b'.repeat(64),
    signal: new AbortController().signal,
    report: async () => {},
  };
  function View() {
    const [status, setStatus] = useState<'loading' | 'ready'>('loading');
    return (
      <MediaPlayer
        mediaTitle="Fixture"
        source={{
          sourceRef: 'local-torrent',
          provider: 'torrent',
          kind: 'hls',
          label: 'Local',
          url: source.url,
          availability: 'available',
          browserSupported: true,
        }}
        isStarted
        shouldAutoPlay
        initialPositionSeconds={42}
        status={status}
        localPlayback={binding}
        onStart={() => {}}
        onReady={() => {
          ready();
          setStatus('ready');
        }}
        onError={error}
        onPlay={() => {}}
        onPause={pause}
        onProgress={progress}
      />
    );
  }
  const view = render(<View />);
  player = view.container.querySelector('yane-player') as FakePlayer;
  expect(player.options.trackPreferences).toEqual({ text: null });
  expect(screen.getByText('Загрузка плеера Local')).toBeDefined();
  expect(
    view.container.querySelector('.relative.z-10')?.classList.contains('pointer-events-none'),
  ).toBe(true);
  await act(async () => player.emit('playing', { type: 'text' }));
  expect(ready).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Загрузка плеера Local')).toBeNull();
  expect(progress).not.toHaveBeenCalled();
  await act(async () => player.emit('paused'));
  expect(pause).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  await act(async () => settle());
  await waitFor(() => expect(progress).toHaveBeenCalledWith(43, 192, 'metadata'));
  expect(ready).toHaveBeenCalledTimes(1);
});

test('initial position settles before restoring saved captions, whose failure leaves progress and pause usable', async () => {
  const progress = mock(() => {}),
    pause = mock(() => {}),
    ready = mock(() => {}),
    error = mock(() => {});
  const base = `http://127.0.0.1:45723/v1/media/${'a'.repeat(64)}/`;
  const textRef = 'c'.repeat(64);
  const source: any = {
    id: 'text-fixture',
    revision: 1,
    type: 'hls',
    url: base + 'master.m3u8',
    audioTracks: [],
    textTracks: [
      {
        textRef,
        label: 'English',
        language: 'eng',
        format: 'vtt',
        default: true,
        forced: true,
        sdh: true,
        available: true,
        url: `${base}text-${textRef}.vtt`,
        fonts: [],
      },
    ],
    timeline: {
      mode: 'windowed-vod',
      continuous: true,
      absoluteAnchorSeconds: 42,
      mediaAnchorSeconds: 0,
      durationSeconds: 192,
    },
  };
  const binding: any = {
    source,
    position: 42.3,
    audioId: 'b'.repeat(64),
    signal: new AbortController().signal,
    textPreference: { languages: ['eng'], forced: true, sdh: true },
    report: async () => {},
  };
  const view = render(
    <MediaPlayer
      mediaTitle="Fixture"
      source={{
        sourceRef: 'local-torrent',
        provider: 'torrent',
        kind: 'hls',
        label: 'Local',
        url: source.url,
        availability: 'available',
        browserSupported: true,
      }}
      isStarted
      shouldAutoPlay
      initialPositionSeconds={42.3}
      status="loading"
      localPlayback={binding}
      onStart={() => {}}
      onReady={ready}
      onError={error}
      onPlay={() => {}}
      onPause={pause}
      onProgress={progress}
    />,
  );
  player = view.container.querySelector('yane-player') as FakePlayer;
  expect(player.options).toMatchObject({ positionSeconds: 42.3, trackPreferences: { text: null } });
  let rejectText!: (error: Error) => void;
  player.selectText.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectText = reject;
      }),
  );
  await act(async () => player.emit('playing'));
  player.snapshot.textTracks = [
    {
      id: `subtitle:${textRef}`,
      label: 'English',
      language: 'eng',
      forced: true,
      sdh: true,
      default: true,
    },
  ];
  await act(async () => settle());
  expect(progress).toHaveBeenCalledWith(43, 192, 'metadata');
  expect(player.selectText).toHaveBeenCalledWith(`subtitle:${textRef}`);
  await act(async () => player.emit('paused', { type: 'text' }));
  // Explicit paused intent remains available while captions are pending.
  player.snapshot.intent = 'paused';
  await act(async () =>
    player.dispatchEvent(
      new CustomEvent('yp-statechange', {
        detail: { source: player.snapshot.source, snapshot: player.snapshot },
      }),
    ),
  );
  expect(pause).toHaveBeenCalledTimes(1);
  await act(async () => rejectText(new Error('Subtitle unavailable')));
  expect(error).not.toHaveBeenCalled();
  expect(ready).toHaveBeenCalledTimes(1);
});
