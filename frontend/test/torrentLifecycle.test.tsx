import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { act, useState } = await import('react');
const { render, fireEvent, screen, waitFor, cleanup } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { privateProfileQueryOptions } = await import('../src/features/social-data');
const { TorrentLaunch } = await import('../src/features/torrent-launch/ui/TorrentLaunch');
const { PlaybackSourcePicker } =
  await import('../src/features/source-selection/ui/PlaybackSourcePicker');
const { PlaybackSessionProvider } =
  await import('../src/features/playback-session/model/PlaybackSessionProvider');
const { usePlaybackSession } =
  await import('../src/features/playback-session/model/usePlaybackSession');
const { resetTorrentClientScope } = await import('../src/entities/torrent-session');
const hlsInstances: FakeHls[] = [];
class FakeHls {
  config: { xhrSetup: (xhr: { withCredentials: boolean }) => void };
  static Events = { ERROR: 'error' };
  static isSupported() {
    return true;
  }
  loadSource = mock((_url: string) => {});
  attachMedia = mock((_video: HTMLVideoElement) => {});
  destroy = mock(() => {});
  error?: (event: string, data: { fatal: boolean }) => void;
  constructor(config: { xhrSetup: (xhr: { withCredentials: boolean }) => void }) {
    this.config = config;
    hlsInstances.push(this);
  }
  on(_event: string, callback: (event: string, data: { fatal: boolean }) => void) {
    this.error = callback;
  }
}
mock.module('hls.js', () => ({ default: FakeHls }));
const { MediaVideoRenderer } = await import('../src/widgets/media-player/ui/MediaVideoRenderer');
import type { AuthState } from '../src/entities/auth/model/authContext';
import type { TorrentSessionDto } from '../src/entities/torrent-session/api/torrentSessionDto';

const originalFetch = globalThis.fetch;
const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
const id = 'torrent_session_abcdefghijklmnopqrstuv';
const fileRef = 'torrent_file_abcdefghijklmnopqrstuv';
const user = {
  email: 'alice@example.test',
  displayName: 'Alice',
  createdAt: new Date().toISOString(),
};
const authenticated: AuthState = { status: 'authenticated', user };
let session: TorrentSessionDto;
let calls: Array<{ path: string; method: string; body: unknown }>;
let client: InstanceType<typeof QueryClient>;
let failPlayback: boolean;
let discoveryMode: boolean;
let candidateCreateCount: number;
let activeAvailable: boolean;
let failStop: boolean;
let stopGate: Promise<void> | null;

beforeEach(() => {
  resetTorrentClientScope();
  hlsInstances.length = 0;
  localStorage.clear();
  calls = [];
  failPlayback = false;
  discoveryMode = false;
  candidateCreateCount = 0;
  activeAvailable = true;
  failStop = false;
  stopGate = null;
  session = {
    sessionId: id,
    mediaRef,
    state: 'awaiting_file',
    version: 3,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: {
      progressBasisPoints: null,
      downloadSpeedBytesPerSecond: 0,
      peers: 0,
      downloadedBytes: 0,
    },
    files: [{ fileRef, displayName: 'Episode.mkv', sizeBytes: 1024, mediaKind: 'video' }],
    selectedFileRef: null,
    audioTracks: [],
    playback: null,
    failure: null,
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(privateProfileQueryOptions(user.email).queryKey, { emailVerified: true });
  globalThis.fetch = mock(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ path, method, body });
    if (path.endsWith('/continue-watching')) return Response.json({ data: { entries: [] } });
    if (path.includes('/continue-watching/')) {
      return Response.json({
        data: { entries: [{ ...body, mediaRef, updatedAt: new Date().toISOString() }] },
      });
    }
    if (method === 'DELETE') {
      if (stopGate) await stopGate;
      if (failStop)
        return Response.json(
          { error: { code: 'TORRENT_UNAVAILABLE', message: 'Unavailable' } },
          { status: 503 },
        );
      activeAvailable = false;
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/active'))
      return Response.json({
        data: (discoveryMode && candidateCreateCount === 0) || !activeAvailable ? null : session,
      });
    if (path.endsWith('/candidates'))
      return Response.json({
        data: {
          mediaRef,
          degraded: false,
          expiresInSeconds: 600,
          candidates: [10, 30].map((seeders, index) => ({
            candidateRef: `candidate_${String(index).repeat(24)}`,
            title: `Fixture ${seeders}`,
            tracker: 'Fixture',
            stale: false,
            size: 1024,
            seeders,
            publishedAt: null,
            score: 50 - seeders,
            reasons: [],
            quality: 'WEB-DL',
            resolution: '1080p',
            voice: null,
            studio: null,
            russianSubtitles: false,
            season: null,
            episode: null,
          })),
        },
      });
    if (path.endsWith('/from-candidate')) {
      candidateCreateCount++;
      activeAvailable = true;
      session = {
        ...session,
        sessionId: candidateCreateCount === 1 ? id : 'torrent_session_zyxwvutsrqponmlkjihgfe',
        state: 'awaiting_playback',
        selectedFileRef: fileRef,
        playback: null,
        failure: null,
      };
      return Response.json({ data: session });
    }
    if (path.endsWith('/file')) {
      session = {
        ...session,
        state: 'awaiting_playback',
        selectedFileRef: body.fileRef,
        version: 4,
      };
    }
    if (path.endsWith('/playback')) {
      if (failPlayback) {
        failPlayback = false;
        return Response.json(
          { error: { code: 'TORRENT_UNAVAILABLE', message: 'Unavailable' } },
          { status: 503 },
        );
      }
      session = {
        ...session,
        state: 'ready',
        version: 5,
        playback: {
          source: {
            type: 'hls',
            url: `/api/v1/torrent-sessions/${session.sessionId}/hls/master.m3u8`,
          },
          generation: 1,
          startPositionSeconds: body.startPositionSeconds,
          durationSeconds: 1200,
          selectedAudioTrackRef: 'track-main',
          audioTracks: [],
          supportsSubtitleSelection: false,
        },
      };
    }
    if (path.includes('/torrent-sessions')) return Response.json({ data: session });
    throw new Error(`Unexpected test request: ${method} ${path}`);
  }) as typeof fetch;
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
  resetTorrentClientScope();
});

afterEach(() => {
  cleanup();
  client.clear();
  resetTorrentClientScope();
  globalThis.fetch = originalFetch;
  localStorage.clear();
});

function mount(state: AuthState = authenticated, verified = true) {
  client.setQueryData(privateProfileQueryOptions(user.email).queryKey, { emailVerified: verified });
  const ready = mock(() => {});
  const changed = mock(() => {});
  function SourceSelection() {
    const [open, setOpen] = useState(false);
    const [playRequest, setPlayRequest] = useState(0);
    const [selected, setSelected] = useState(true);
    const [error, setError] = useState<string | null>(null);
    return (
      <>
        <PlaybackSourcePicker
          embedSources={[]}
          directSources={[]}
          selectedTrackKey={null}
          onEmbedSelect={() => {}}
          onDirectSelect={() => {}}
          onQualitySelect={() => {}}
          onTorrentOpenChange={setOpen}
          torrentOpen={open}
          torrentPanel={(close) => (
            <TorrentLaunch
              open={open}
              onOpenChange={setOpen}
              selected={selected}
              playRequest={playRequest}
              onSourceSelect={() => {
                setSelected(true);
                setPlayRequest((request) => request + 1);
                close();
              }}
              onPlaybackError={setError}
              mediaRef={mediaRef}
              activeSession={null}
              resumePositionSeconds={42}
              onPlaybackReady={ready}
              onSessionChange={changed}
            />
          )}
        />
        <button
          onClick={() => {
            setError(null);
            setPlayRequest((request) => request + 1);
          }}
        >
          Retry
        </button>
        {error && <output role="alert">{error}</output>}
      </>
    );
  }
  const tree = (auth: AuthState) => (
    <QueryClientProvider client={client}>
      <AuthContext
        value={{
          state: auth,
          setAuthenticated: () => {},
          setGuest: () => {},
          refresh: async () => {},
        }}
      >
        <MemoryRouter initialEntries={[`/media/${mediaRef}?season=1`]}>
          <SourceSelection />
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>
  );
  return { ...render(tree(state)), ready, changed, tree };
}

function openTorrent() {
  expect(screen.queryByRole('button', { name: 'Смотреть торрент' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Источник' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Торренты' }));
  expect(screen.queryByText('Размер видео — до 30 ГиБ.')).toBeNull();
}

describe('torrent user lifecycle', () => {
  test('autoplays selections, retains the list and waits for Stop before replacing playback', async () => {
    discoveryMode = true;
    const view = mount();
    openTorrent();
    await screen.findByRole('button', { name: /Fixture 10/ });
    expect(calls.filter(({ path }) => path.endsWith('/candidates'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка', exact: true }));
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Сортировка' }), { key: 'Escape' });
    expect(screen.getByRole('tab', { name: 'Торренты' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка', exact: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Больше раздающих', exact: true }));
    expect(screen.getAllByRole('button', { name: /Fixture (10|30)/ })[0].textContent).toContain(
      'Fixture 30',
    );
    fireEvent.click(screen.getByRole('button', { name: /Fixture 30/ }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Торренты' })).toBeNull());
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(1));
    expect(calls.filter(({ path }) => path.endsWith('/playback'))).toHaveLength(1);
    openTorrent();
    await screen.findByRole('button', { name: /Fixture 10/ });
    expect(calls.filter(({ path }) => path.endsWith('/candidates'))).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Остановить сессию' })).toBeNull();
    let releaseStop!: () => void;
    stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    fireEvent.click(screen.getByRole('button', { name: /Fixture 10/ }));
    await waitFor(() => expect(calls.filter(({ method }) => method === 'DELETE')).toHaveLength(1));
    expect(candidateCreateCount).toBe(1);
    await act(async () => releaseStop());
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(2));
    expect(candidateCreateCount).toBe(2);
    expect(view.ready.mock.calls[1]?.[0].id).not.toBe(id);
  }, 20000);

  test('requires login or verified email before requesting a torrent', async () => {
    const view = mount({ status: 'guest', user: null });
    openTorrent();
    const login = screen.getByRole('link', { name: 'Войти и вернуться к просмотру' });
    expect(login.getAttribute('href')).toContain('intent=torrent');
    expect(login.getAttribute('href')).toContain('returnTo=');
    expect(calls).toHaveLength(0);
    client.setQueryData(privateProfileQueryOptions(user.email).queryKey, { emailVerified: false });
    view.rerender(view.tree(authenticated));
    await screen.findByText(/Подтвердите email/);
    expect(calls.filter(({ path }) => path.includes('/torrent-'))).toHaveLength(0);
  });

  test('keeps the old session and does not create a replacement when automatic Stop fails', async () => {
    discoveryMode = true;
    const view = mount();
    openTorrent();
    fireEvent.click(await screen.findByRole('button', { name: /Fixture 10/ }));
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(1));
    openTorrent();
    failStop = true;
    fireEvent.click(await screen.findByRole('button', { name: /Fixture 30/ }));
    await screen.findByRole('alert');
    expect(candidateCreateCount).toBe(1);
    expect(view.ready).toHaveBeenCalledTimes(1);
    expect(activeAvailable).toBe(true);
  });

  test('autoplays after multi-file selection at saved progress and keeps the release list accessible', async () => {
    const view = mount();
    openTorrent();
    await screen.findByText('Episode.mkv');
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(view.ready).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Episode.mkv/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить выбор' }));
    await waitFor(() => expect(calls.find(({ path }) => path.endsWith('/file'))).toBeDefined());
    expect(calls.find(({ path }) => path.endsWith('/file'))?.body).toEqual({
      fileRef,
      expectedVersion: 3,
    });
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(1));
    expect(calls.find(({ path }) => path.endsWith('/playback'))?.body).toMatchObject({
      startPositionSeconds: 42,
      expectedVersion: 4,
    });
    expect(view.ready.mock.calls[0]).toMatchObject([
      {
        playback: {
          startPositionSeconds: 42,
          hlsUrl: expect.stringContaining(`/torrent-sessions/${id}/hls/master.m3u8`),
        },
      },
    ]);
    openTorrent();
    await screen.findByRole('button', { name: /Fixture 10/ });
    expect(screen.queryByRole('button', { name: 'Остановить сессию' })).toBeNull();
    expect(calls.some(({ method }) => method === 'DELETE')).toBe(false);
  });

  test('keeps a failed playback retry explicit and clears account state on logout', async () => {
    discoveryMode = true;
    failPlayback = true;
    const view = mount();
    openTorrent();
    await screen.findByRole('button', { name: /Fixture 10/ });
    expect(calls.filter(({ path }) => path.endsWith('/playback'))).toHaveLength(0);
    expect(view.ready).not.toHaveBeenCalled();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: /Fixture 10/ }));
    await screen.findByRole('alert');
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(calls.filter(({ path }) => path.endsWith('/playback'))).toHaveLength(1);
    expect(view.ready).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(1));
    expect(calls.filter(({ path }) => path.endsWith('/playback'))).toHaveLength(2);
    openTorrent();
    view.rerender(view.tree({ status: 'guest', user: null }));
    await screen.findByRole('link', { name: 'Войти и вернуться к просмотру' });
    await waitFor(() => expect(view.changed).toHaveBeenLastCalledWith(null));
    expect(screen.queryByText('Нажмите Play на плеере, чтобы начать просмотр.')).toBeNull();
  });
});

function PlayerActions() {
  const playback = usePlaybackSession();
  return (
    <>
      <button
        onClick={() =>
          playback.startSession({
            mediaRef,
            mediaSnapshot: { title: 'Fixture' },
            sourceRef: `torrent:${id}`,
            episode: null,
            positionSeconds: 42,
            durationSeconds: 1200,
          })
        }
      >
        start
      </button>
      <button onClick={() => playback.updateProgress(64, 1200, 'pause')}>progress</button>
      <button onClick={playback.endSession}>stop</button>
      <output>{playback.session?.sourceRef ?? 'closed'}</output>
    </>
  );
}

describe('torrent playback progress and cleanup', () => {
  test('persists account progress, stops the engine on close and clears the player on account reset', async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthContext
          value={{
            state: authenticated,
            setAuthenticated: () => {},
            setGuest: () => {},
            refresh: async () => {},
          }}
        >
          <PlaybackSessionProvider>
            <PlayerActions />
          </PlaybackSessionProvider>
        </AuthContext>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(calls.some(({ path }) => path.endsWith('/continue-watching'))).toBe(true),
    );
    fireEvent.click(screen.getByText('start'));
    await screen.findByText(`torrent:${id}`);
    fireEvent.click(screen.getByText('progress'));
    await waitFor(() =>
      expect(
        calls.some(
          ({ path, body }) =>
            path.includes('/continue-watching/') &&
            (body as { positionSeconds: number }).positionSeconds === 64,
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByText('stop'));
    await screen.findByText('closed');
    await waitFor(() =>
      expect(calls.some(({ path, method }) => path.endsWith(id) && method === 'DELETE')).toBe(true),
    );
    fireEvent.click(screen.getByText('start'));
    await screen.findByText(`torrent:${id}`);
    await act(async () => resetTorrentClientScope());
    await screen.findByText('closed');
    expect(localStorage.getItem('yanemedia-playback-session')).toBeNull();
  });
});

describe('torrent HLS renderer contract', () => {
  test('uses authenticated HLS, reports absolute progress and releases HLS on unmount', async () => {
    const progress = mock(() => {});
    const ready = mock(() => {});
    const error = mock(() => {});
    const url = `/api/v1/torrent-sessions/${id}/hls/master.m3u8`;
    const view = render(
      <MediaVideoRenderer
        source={{
          sourceRef: `torrent:${id}`,
          kind: 'hls',
          provider: 'torrent',
          label: 'Torrent',
          url,
          availability: 'available',
          browserSupported: true,
        }}
        mediaTitle="Fixture"
        shouldAutoPlay
        initialPositionSeconds={42}
        torrentTimeline={{ startPositionSeconds: 42, durationSeconds: 1200, onSeek: () => {} }}
        onReady={ready}
        onError={error}
        onProgress={progress}
        onPlay={() => {}}
        onPause={() => {}}
      />,
    );
    await waitFor(() => expect(hlsInstances).toHaveLength(1));
    const hls = hlsInstances[0];
    const video = screen.getByTitle('Плеер Torrent: Fixture') as HTMLVideoElement;
    expect(hls.loadSource).toHaveBeenCalledWith(url);
    expect(hls.attachMedia).toHaveBeenCalledWith(video);
    const xhr = { withCredentials: false };
    hls.config.xhrSetup(xhr);
    expect(xhr.withCredentials).toBe(true);
    video.currentTime = 5;
    fireEvent.loadedMetadata(video);
    expect(progress).toHaveBeenCalledWith(47, 1200, 'metadata');
    expect(video.currentTime).toBe(5);
    fireEvent.canPlay(video);
    expect(ready).toHaveBeenCalledTimes(1);
    await act(async () => hls.error?.('error', { fatal: false }));
    expect(error).not.toHaveBeenCalled();
    await act(async () => hls.error?.('error', { fatal: true }));
    expect(error).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(video.getAttribute('src')).toBeNull();
  });
});
