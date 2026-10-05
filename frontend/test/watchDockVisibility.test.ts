import { describe, expect, test } from 'bun:test';
import type { PlaybackSession } from '../src/entities/playback';
import { isActivePlaybackMediaRoute } from '../src/app/layout/watchDockVisibility';

const session = {
  mediaRef: 'work_12345678-1234-4123-8123-123456789abc',
  mediaSnapshot: { title: 'Разделение', slug: 'severance' },
  sourceRef: 'source',
  episode: { seasonNumber: 1, episodeNumber: 1 },
  state: 'paused',
  positionSeconds: 120,
  durationSeconds: 3_600,
  volume: 1,
  updatedAt: '2026-10-05T00:00:00.000Z',
} satisfies PlaybackSession;

describe('watch dock visibility on media routes', () => {
  test('identifies the active playback page by slug or canonical ref', () => {
    expect(isActivePlaybackMediaRoute(session, 'severance')).toBe(true);
    expect(isActivePlaybackMediaRoute(session, session.mediaRef)).toBe(true);
  });

  test('keeps the dock visible on another media page', () => {
    expect(isActivePlaybackMediaRoute(session, 'inception')).toBe(false);
  });
});
