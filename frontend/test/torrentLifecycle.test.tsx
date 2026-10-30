import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });
// Happy DOM has no media decoder; actual capabilities/transport are checked in Chromium.
Object.defineProperty(globalThis, 'MediaSource', {
  configurable: true,
  value: { isTypeSupported: () => true },
});
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
// Test the app's public-element boundary; transport playback is checked in Chromium.
const players: FakePlayer[] = [];
class FakePlayer extends HTMLElement {
  host: any;
  navigation: any;
  label = '';
  descriptor: any;
  options: any;
  disconnected = false;
  runtime = { getSnapshot: () => ({ durationSeconds: 1200 }) };
  setSource = mock(async (source: any, options: any) => {
    this.descriptor = source;
    this.options = options;
  });
  selectAudio = mock(async () => {});
  selectQuality = mock(async () => {});
  seek = mock(async (_position: number) => {});
  connectedCallback() {
    players.push(this);
  }
  disconnectedCallback() {
    this.disconnected = true;
  }
  emit(type: string, snapshot: any) {
    this.dispatchEvent(
      new CustomEvent('yp-' + type, { detail: { type, source: snapshot.source, snapshot } }),
    );
  }
}
customElements.define('yane-player', FakePlayer);
mock.module('@yaneart/yaneplayer', () => ({}));
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
  players.length = 0;
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
          timeline: {
            absoluteAnchorSeconds: 40,
            mediaAnchorSeconds: 0.083333,
            windowEndSeconds: 160,
          },
          playbackRates: [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2],
          durationSeconds: 1200,
          selectedAudioTrackRef: body.audioTrackRef ?? 'track-main',
          audioTracks: session.audioTracks,
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
  test('chooses a probed audio track before starting playback', async () => {
    session = {
      ...session,
      state: 'awaiting_playback',
      selectedFileRef: fileRef,
      audioTracks: [
        {
          trackRef: 'track-main',
          label: 'Original',
          language: 'eng',
          channels: 2,
          isDefault: true,
        },
        { trackRef: 'track-dub', label: 'Dub', language: 'rus', channels: 2, isDefault: false },
      ],
    };
    const view = mount();
    openTorrent();
    const select = await screen.findByRole('combobox', { name: 'Аудиодорожка торрента' });
    expect(calls.some(({ path }) => path.endsWith('/playback'))).toBe(false);
    fireEvent.change(select, { target: { value: 'track-dub' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(view.ready).toHaveBeenCalledTimes(1));
    expect(calls.find(({ path }) => path.endsWith('/playback'))?.body).toMatchObject({
      audioTrackRef: 'track-dub',
      startPositionSeconds: 42,
    });
    expect(view.ready.mock.calls[0]?.[0].playback.selectedAudioTrackRef).toBe('track-dub');
  });

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
          timeline: {
            absoluteAnchorSeconds: 40,
            mediaAnchorSeconds: 0.083333,
            windowEndSeconds: 160,
          },
          playbackRates: [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2],
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

describe('torrent player adapter contract', () => {
  test('confirms audio only with ready replacement refs and retains the public player', async () => {
    const audioTracks = [
      { ref: 'main', label: 'Original', language: 'eng', channels: 2, isDefault: true },
      { ref: 'dub', label: 'Dub', language: 'rus', channels: 6, isDefault: false },
    ];
    const nextPlayback = {
      hlsUrl: '/new.m3u8',
      generation: 2,
      startPositionSeconds: 47,
      timeline: { absoluteAnchorSeconds: 46, mediaAnchorSeconds: 0.08, windowEndSeconds: 166 },
      durationSeconds: 1200,
      playbackRates: [0.5, 1, 2],
      selectedAudioTrackRef: 'new-dub',
      audioTracks: audioTracks.map((track) => ({ ...track, ref: 'new-' + track.ref })),
      subtitleTracks: [
        {
          ref: 'captions',
          label: 'Русский',
          language: 'rus',
          format: 'ass' as const,
          isDefault: false,
          isForced: true,
          isSdh: true,
          available: true,
          unavailableReason: null,
          url: 'http://localhost:3000/api/v1/torrent-sessions/fixture/subtitles/2/captions',
          fonts: [
            {
              ref: 'font',
              url: 'http://localhost:3000/api/v1/torrent-sessions/fixture/subtitle-fonts/2/font',
            },
          ],
        },
      ],
    };
    let settle!: (value: any) => void;
    const onReplace = mock(
      () =>
        new Promise<any>((resolve) => {
          settle = resolve;
        }),
    );
    const props = {
      source: {
        sourceRef: `torrent:${id}:1`,
        kind: 'hls' as const,
        provider: 'torrent',
        label: 'Torrent',
        url: '/old.m3u8',
        availability: 'available' as const,
        browserSupported: true,
      },
      mediaTitle: 'Fixture',
      shouldAutoPlay: false,
      initialPositionSeconds: 42,
      torrentTimeline: {
        ...nextPlayback,
        startPositionSeconds: 42,
        audioTracks,
        selectedAudioTrackRef: 'main',
        onReplace,
      },
      onReady: mock(() => {}),
      onError: mock(() => {}),
      onProgress: mock(() => {}),
      onPlay: () => {},
      onPause: () => {},
    };
    const view = render(<MediaVideoRenderer {...props} />);
    const player = players[0];
    expect(player.descriptor.capabilities.audio).toBe('host');
    expect(player.descriptor.capabilities.quality).toBe('none');
    expect(player.descriptor.subtitles[0]).toMatchObject({
      id: 'captions',
      format: 'ass',
      forced: true,
      sdh: true,
      request: { allowedOrigins: ['http://localhost:3000'], credentials: 'include' },
    });
    expect(player.descriptor.audioTracks[1]).toMatchObject({
      id: 'dub',
      language: 'rus',
      channels: '6',
    });
    const signal = new AbortController().signal;
    await expect(
      player.host.execute(
        { type: 'audio', id: 'main', target: { audioId: 'main' } },
        { signal, positionSeconds: 47 },
      ),
    ).resolves.toEqual({ selection: { audioId: 'main' } });
    expect(onReplace).not.toHaveBeenCalled();
    const pending = player.host.execute(
      { type: 'audio', id: 'ignored', target: { audioId: 'dub', positionSeconds: 47 } },
      { signal, positionSeconds: 45, intent: 'paused' },
    );
    expect(onReplace).toHaveBeenCalledWith(47, signal, 'dub');
    expect(props.onProgress).not.toHaveBeenCalled();
    settle({ id, playback: nextPlayback });
    const result = await pending;
    expect(result.selection).toEqual({ audioId: 'new-dub' });
    expect(result.source.audioTracks[1].id).toBe('new-dub');
    expect(result.source.subtitles[0].src).toContain('/subtitles/2/captions');
    expect(result.source.subtitles[0].fonts[0].request.credentials).toBe('include');
    expect(result.source.audioTracks[0].default).toBe(true);
    expect(result.source.audioTracks[1].default).toBe(false);
    view.rerender(
      <MediaVideoRenderer
        {...props}
        source={{ ...props.source, sourceRef: `torrent:${id}:2`, url: '/new.m3u8' }}
        torrentTimeline={{ ...nextPlayback, onReplace }}
      />,
    );
    expect(players).toHaveLength(1);
    expect(player.setSource).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('bridges combined source selection with confirmed position and paused intent without reloading twice', async () => {
    const ready = mock(() => {});
    const selection = mock((track: string | null, quality: string | null) => {
      view.rerender(
        <MediaVideoRenderer
          {...props}
          source={{ ...props.source, sourceRef: 'en1080', url: '/en1080.mp4' }}
          directControls={{
            ...props.directControls,
            selectedTrackKey: track,
            selectedQualityKey: quality,
          }}
        />,
      );
    });
    const props = {
      source: {
        sourceRef: 'ru720',
        kind: 'mp4' as const,
        provider: 'videohub-streaming',
        label: 'Fixture',
        url: '/ru720.mp4',
        availability: 'available' as const,
        browserSupported: true,
      },
      mediaTitle: 'Fixture',
      shouldAutoPlay: false,
      initialPositionSeconds: 67,
      directControls: {
        tracks: [
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'English' },
        ],
        selectedTrackKey: 'ru',
        qualities: [
          { value: '720', label: '720p' },
          { value: '1080', label: '1080p' },
        ],
        selectedQualityKey: '720',
        onSelectionChange: selection,
      },
      onReady: ready,
      onError: mock(() => {}),
      onProgress: mock(() => {}),
      onPlay: () => {},
      onPause: () => {},
    };
    const view = render(<MediaVideoRenderer {...props} />);
    const player = players[0];
    expect(player.descriptor.crossOrigin).toBeNull();
    const snapshot = {
      source: { id: 'media', revision: player.descriptor.revision },
      playback: 'ready',
      positionSeconds: 67,
      durationSeconds: 1200,
      pending: null,
    };
    await act(async () => player.emit('statechange', snapshot));
    let result: any;
    await act(async () => {
      result = player.host.execute(
        { type: 'quality', id: '1080', target: { audioId: 'en', qualityId: '1080' } },
        { signal: new AbortController().signal, positionSeconds: 67, intent: 'paused' },
      );
    });
    result = await result;
    expect(selection).toHaveBeenCalledWith('en', '1080', 67, 'paused');
    expect(result.source.src).toBe('/en1080.mp4');
    expect(result.source.crossOrigin).toBeNull();
    expect(result.selection).toEqual({ audioId: 'en', qualityId: '1080' });
    expect(player.setSource).toHaveBeenCalledTimes(1);
    const replacement = { ...snapshot, source: { id: 'media', revision: result.source.revision } };
    await act(async () => {
      player.emit('statechange', {
        ...replacement,
        playback: 'loading',
        pending: { type: 'quality' },
      });
      player.emit('statechange', replacement);
    });
    expect(ready).toHaveBeenCalledTimes(2);
    view.rerender(
      <MediaVideoRenderer
        {...props}
        source={{
          ...props.source,
          provider: 'veoveo-streaming',
          sourceRef: 'veoveo',
          url: '/veoveo.mp4',
        }}
      />,
    );
    expect(player.descriptor.crossOrigin).toBeUndefined();
    view.unmount();
  });

  test('maps authenticated HLS and absolute progress, ignores pending/stale events and disconnects', async () => {
    const progress = mock(() => {}),
      ready = mock(() => {}),
      error = mock(() => {});
    const url = `/api/v1/torrent-sessions/${id}/hls/master.m3u8`;
    const props = {
      source: {
        sourceRef: `torrent:${id}`,
        kind: 'hls' as const,
        provider: 'torrent',
        label: 'Torrent',
        url,
        availability: 'available' as const,
        browserSupported: true,
      },
      mediaTitle: 'Fixture',
      shouldAutoPlay: true,
      initialPositionSeconds: 42,
      torrentTimeline: {
        startPositionSeconds: 42,
        timeline: {
          absoluteAnchorSeconds: 40,
          mediaAnchorSeconds: 0.083333,
          windowEndSeconds: 160,
        },
        playbackRates: [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2],
        durationSeconds: 1200,
        audioTracks: [
          { ref: 'audio', label: 'Русская', language: 'rus', channels: 2, isDefault: true },
        ],
        selectedAudioTrackRef: 'audio',
        onReplace: () => {},
      },
      onReady: ready,
      onError: error,
      onProgress: progress,
      onPlay: () => {},
      onPause: () => {},
    };
    const view = render(<MediaVideoRenderer {...props} />);
    const player = players[0];
    expect(player.descriptor.src).toBe(url);
    expect(player.descriptor.crossOrigin).toBe('use-credentials');
    expect(player.descriptor.timeline.absoluteAnchorSeconds).toBe(40);
    expect(player.descriptor.capabilities.playbackRates).toEqual([
      0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2,
    ]);
    const snapshot = {
      source: { id: 'media', revision: player.descriptor.revision },
      playback: 'ready',
      positionSeconds: 47,
      durationSeconds: 1200,
      pending: null,
    };
    await act(async () => player.emit('statechange', snapshot));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(47, 1200, 'metadata');
    progress.mockClear();
    await act(async () =>
      player.emit('positionchange', {
        ...snapshot,
        positionSeconds: 900,
        pending: { type: 'seek' },
      }),
    );
    expect(progress).not.toHaveBeenCalled();
    await act(async () =>
      player.emit('positionchange', { ...snapshot, source: { id: 'media', revision: 'old' } }),
    );
    expect(progress).not.toHaveBeenCalled();
    await act(async () => player.emit('positionchange', { ...snapshot, positionSeconds: 49 }));
    expect(progress).toHaveBeenCalledWith(49, 1200, 'periodic');
    view.rerender(<MediaVideoRenderer {...props} initialPositionSeconds={49} />);
    expect(player.setSource).toHaveBeenCalledTimes(1);
    await act(async () =>
      player.emit('error', { ...snapshot, playback: 'ready', error: { code: 'autoplay-blocked' } }),
    );
    expect(error).not.toHaveBeenCalled();
    // A finite window ending is a queued host seek, not a completed film.
    await act(async () =>
      player.emit('ended', {
        ...snapshot,
        playback: 'ended',
        positionSeconds: 160,
        seekable: [[40, 160]],
      }),
    );
    expect(player.seek).toHaveBeenCalledWith(160.001);
    const controller = new AbortController();
    let settle!: (value: any) => void;
    const onReplace = mock(
      (_position: number, _signal: AbortSignal) =>
        new Promise<any>((resolve) => {
          settle = resolve;
        }),
    );
    view.rerender(
      <MediaVideoRenderer {...props} torrentTimeline={{ ...props.torrentTimeline, onReplace }} />,
    );
    const command = player.host.execute(
      { type: 'seek', seconds: 900, target: { positionSeconds: 901 } },
      { signal: controller.signal, positionSeconds: 49, intent: 'paused' },
    );
    expect(onReplace).toHaveBeenCalledWith(901, controller.signal, undefined);
    await act(async () =>
      player.emit('error', { ...snapshot, playback: 'error', pending: { type: 'seek' } }),
    );
    expect(error).not.toHaveBeenCalled();
    controller.abort();
    settle({ id, playback: {} });
    await expect(command).rejects.toMatchObject({ name: 'AbortError' });
    // Aborted POST may have switched the server. The old selection must be
    // restored through a real command, never confirmed from stale React props.
    const restoreSignal = new AbortController().signal;
    const restore = player.host.execute(
      { type: 'audio', id: 'audio', target: { audioId: 'audio' } },
      { signal: restoreSignal, positionSeconds: 49, intent: 'paused' },
    );
    expect(onReplace).toHaveBeenLastCalledWith(49, restoreSignal, 'audio');
    settle({
      id,
      playback: {
        ...props.torrentTimeline,
        generation: 2,
        hlsUrl: '/restored.m3u8',
        selectedAudioTrackRef: 'audio',
      },
    });
    await restore;
    expect(player.setSource).toHaveBeenCalledTimes(1);
    const restoredSnapshot = {
      ...snapshot,
      source: {
        id: 'media',
        revision: JSON.stringify([
          `torrent:${id}:2`,
          '/restored.m3u8',
          props.torrentTimeline.timeline,
        ]),
      },
    };
    await act(async () => player.emit('error', { ...restoredSnapshot, playback: 'error' }));
    expect(error).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(player.disconnected).toBe(true);
    progress.mockClear();
    player.emit('positionchange', snapshot);
    expect(progress).not.toHaveBeenCalled();
  });
});
