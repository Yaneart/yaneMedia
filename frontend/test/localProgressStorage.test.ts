import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();
mock.module('@/shared/config/serverTorrent', () => ({ SERVER_TORRENT_ENABLED: false }));
const {
  loadPlaybackSession,
  savePlaybackSession,
  getPlaybackSessionForOwner,
  reconcilePlaybackSessionOwner,
} = await import('../src/features/playback-session/model/playbackSessionStorage');
const { loadContinueWatchingEntries, saveContinueWatchingEntries } =
  await import('../src/features/playback-session/model/continueWatchingStorage');
const { mergeAccountAndGuestProgress } =
  await import('../src/features/playback-session/model/accountContinueWatching');
const { getAccountContinueWatching, saveAccountContinueWatching } =
  await import('../src/features/playback-session/api/continueWatchingApi');
import type { PlaybackSession } from '../src/entities/playback';

const old: PlaybackSession = {
  mediaRef: 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60',
  mediaSnapshot: { title: 'Fixture' },
  sourceRef: 'torrent:torrent_session_abcdefghijklmnopqrstuv',
  episode: { seasonNumber: 2, episodeNumber: 3 },
  positionSeconds: 42,
  durationSeconds: 100,
  state: 'paused',
  volume: 1,
  updatedAt: new Date().toISOString(),
};
const originalFetch = globalThis.fetch;
afterEach(() => {
  localStorage.clear();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

test('Public migrates legacy persisted Home session and progress without losing coordinates', () => {
  localStorage.setItem(
    'yanemedia-playback-session',
    JSON.stringify({ version: 2, ownerId: 'alice', session: old }),
  );
  localStorage.setItem(
    'yanemedia-continue-watching',
    JSON.stringify({ version: 2, entries: [old] }),
  );
  const stored = loadPlaybackSession()!;
  expect(stored.session).toMatchObject({
    sourceRef: 'local-torrent',
    episode: old.episode,
    positionSeconds: 42,
  });
  expect(loadContinueWatchingEntries()[0]).toMatchObject({
    sourceRef: 'local-torrent',
    episode: old.episode,
    positionSeconds: 42,
  });
  savePlaybackSession(stored.ownerId, stored.session);
  saveContinueWatchingEntries(loadContinueWatchingEntries());
  expect(localStorage.getItem('yanemedia-playback-session')).not.toContain('torrent_session_');
  expect(localStorage.getItem('yanemedia-continue-watching')).not.toContain('torrent_session_');
});

test('ephemeral local source IDs are normalized on both storage boundaries', () => {
  const local = { ...old, sourceRef: `local:${'a'.repeat(32)}` };
  savePlaybackSession(null, local);
  saveContinueWatchingEntries([local]);
  expect(loadPlaybackSession()?.session.sourceRef).toBe('local-torrent');
  expect(loadContinueWatchingEntries()[0].sourceRef).toBe('local-torrent');
  expect(localStorage.getItem('yanemedia-continue-watching')).not.toContain('a'.repeat(32));
});

test('guest local session and history stay separate from accounts; ordinary guest migration remains available', () => {
  const session = { ...old, sourceRef: 'local-torrent' };
  const stored = { ownerId: null, session };
  expect(getPlaybackSessionForOwner(stored, 'alice')).toBeNull();
  expect(reconcilePlaybackSessionOwner(stored, null, 'alice')).toBeNull();
  expect(getPlaybackSessionForOwner({ ownerId: 'alice', session }, 'bob')).toBeNull();
  expect(getPlaybackSessionForOwner(stored, null)).toBe(session);
  expect(mergeAccountAndGuestProgress([], [session])).toEqual([]);
  const direct = { ...old, sourceRef: 'direct' };
  expect(mergeAccountAndGuestProgress([], [direct])).toEqual([direct]);
});

test('cloud API reads migrate Home refs and writes whitelist descriptive fields', async () => {
  let submitted: any;
  globalThis.fetch = mock(async (_url, init) => {
    if (init?.method === 'PUT') submitted = JSON.parse(init.body as string);
    return Response.json({ data: { entries: [old] } });
  }) as typeof fetch;
  expect((await getAccountContinueWatching()).entries[0]).toMatchObject({
    sourceRef: 'local-torrent',
    positionSeconds: 42,
    episode: old.episode,
  });
  await saveAccountContinueWatching(old.mediaRef, {
    ...old,
    sourceRef: `local:${'b'.repeat(32)}`,
    token: 'private',
    url: 'http://127.0.0.1:45723/',
  } as any);
  expect(submitted).toEqual({
    sourceRef: 'local-torrent',
    episode: old.episode,
    positionSeconds: 42,
    durationSeconds: 100,
  });
});
