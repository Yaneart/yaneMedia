import { describe, expect, test } from 'bun:test';

import { canonicalizeFavoriteMediaRefs } from '../src/features/favorite/model/favoriteStorage';
import { canonicalizeOpeningHistory } from '../src/features/opening-history/model/openingHistoryStorage';
import { canonicalizeContinueWatchingEntries } from '../src/features/playback-session/model/continueWatchingStorage';

const canonicalRef = 'work_11111111-1111-4111-8111-111111111111';
const mappings = new Map([
  ['anilist:1535', canonicalRef],
  ['shikimori:1535', canonicalRef],
]);

describe('guest user media canonicalization', () => {
  test('merges favorite aliases into one canonical work', () => {
    expect([
      ...canonicalizeFavoriteMediaRefs(new Set(['anilist:1535', 'shikimori:1535']), mappings),
    ]).toEqual([canonicalRef]);
  });

  test('keeps the newest history timestamp while merging aliases', () => {
    expect(
      canonicalizeOpeningHistory(
        [
          { mediaRef: 'anilist:1535', openedAt: '2026-10-01T10:00:00.000Z' },
          { mediaRef: 'shikimori:1535', openedAt: '2026-10-02T10:00:00.000Z' },
        ],
        mappings,
      ),
    ).toEqual([{ mediaRef: canonicalRef, openedAt: '2026-10-02T10:00:00.000Z' }]);
  });

  test('keeps the complete newest progress entry while merging aliases', () => {
    const older = {
      mediaRef: 'anilist:1535',
      mediaSnapshot: { title: 'Older' },
      sourceRef: 'older-source',
      episode: null,
      positionSeconds: 120,
      durationSeconds: 1_000,
      updatedAt: '2026-10-01T10:00:00.000Z',
    };
    const newer = {
      ...older,
      mediaRef: 'shikimori:1535',
      mediaSnapshot: { title: 'Newer' },
      sourceRef: 'newer-source',
      positionSeconds: 240,
      updatedAt: '2026-10-02T10:00:00.000Z',
    };

    expect(canonicalizeContinueWatchingEntries([older, newer], mappings)).toEqual([
      { ...newer, mediaRef: canonicalRef },
    ]);
  });
});
