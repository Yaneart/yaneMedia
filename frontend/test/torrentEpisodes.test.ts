import { expect, test } from 'bun:test';
import type { MediaDetails } from '../src/entities/media';
import {
  initialTorrentEpisode,
  torrentEpisodes,
} from '../src/features/torrent-launch/model/torrentEpisodes';
import { torrentEpisodeNavigation } from '../src/pages/media/model/torrentEpisodeNavigation';

const series = { type: 'series', seasons: [] } as unknown as MediaDetails;
const anime = {
  type: 'anime',
  animeKind: 'tv',
  episodes: [],
  episodesCount: 12,
} as unknown as MediaDetails;
const movie = { type: 'movie' } as MediaDetails;
const files = (...names: string[]) =>
  names.map((name, index) => ({ ref: `file-${index}`, name, sizeBytes: 100 }));

test('pack starts from its first actual season, with natural episode ordering and extras excluded', () => {
  const rows = torrentEpisodes(
    files(
      'Show.S02E10.mkv',
      'Show.S02E02.mkv',
      'Show.S03E01.mkv',
      'Sample.S02E01.mkv',
      'Extras/01.mkv',
    ),
    series,
  );
  expect(rows.slice(0, 3).map((row) => row.episode)).toEqual([
    { seasonNumber: 2, episodeNumber: 2 },
    { seasonNumber: 2, episodeNumber: 10 },
    { seasonNumber: 3, episodeNumber: 1 },
  ]);
  expect(initialTorrentEpisode(rows, null, false)?.file.name).toBe('Show.S02E02.mkv');
  expect(rows.slice(3).every((row) => row.episode === null)).toBe(true);
});

test('season folders disambiguate numbered files, including Russian and Windows paths', () => {
  const rows = torrentEpisodes(
    files('Season 2/01.mkv', '3 сезон\\10.mkv', 'S03/Episode 2.mkv', 'Season 3/Show.S02E01.mkv'),
    series,
  );
  expect(rows.map((row) => row.episode)).toEqual([
    { seasonNumber: 2, episodeNumber: 1 },
    { seasonNumber: 3, episodeNumber: 2 },
    { seasonNumber: 3, episodeNumber: 10 },
    null,
  ]);
});

test('bare series numbers need a known single season; years, resolutions and combined episodes stay ambiguous', () => {
  const rows = torrentEpisodes(
    files(
      '01.mkv',
      '2024.mkv',
      '1080p.mkv',
      'Show.S02E01E02.mkv',
      'Show.S02E01-E02.mkv',
      'Season 2/01-02.mkv',
    ),
    series,
  );
  expect(rows.every((row) => row.episode === null)).toBe(true);
  expect(
    torrentEpisodes(files('01.mkv'), {
      ...series,
      seasons: [{ number: 2, episodes: [] }],
    } as MediaDetails)[0]?.episode,
  ).toEqual({ seasonNumber: 2, episodeNumber: 1 });
});

test('duplicate encodes require an explicit file; a requested missing episode never falls back to a different one', () => {
  const rows = torrentEpisodes(files('A.S01E02.720p.mkv', 'A.S01E02.1080p.mkv'), series);
  expect(rows.every((row) => row.ambiguous && row.episode?.episodeNumber === 2)).toBe(true);
  expect(initialTorrentEpisode(rows, { seasonNumber: 1, episodeNumber: 2 }, false)).toBeUndefined();
  expect(initialTorrentEpisode(rows, { seasonNumber: 1, episodeNumber: 3 }, false)).toBeUndefined();
  const withNext = torrentEpisodes(
    files('A.S01E02.720p.mkv', 'A.S01E02.1080p.mkv', 'A.S01E03.mkv'),
    series,
  );
  expect(
    torrentEpisodeNavigation(withNext, withNext[0]!.file.ref, false, async () => {}).next,
  ).toBeDefined();
  expect(
    torrentEpisodeNavigation(withNext, withNext[2]!.file.ref, false, async () => {}).previous,
  ).toBeUndefined();
});

test('logical episode restoration works across different file refs and releases', () => {
  const requested = { seasonNumber: 2, episodeNumber: 10 };
  for (const names of [
    ['Show.S02E02.mkv', 'Show.S02E10.mkv'],
    ['Season 2/10.mkv', 'Season 2/02.mkv'],
  ]) {
    expect(
      initialTorrentEpisode(torrentEpisodes(files(...names), series), requested, false)?.episode,
    ).toEqual(requested);
  }
});

test('anime maps local and absolute releases only into the current verified work', () => {
  const release = {
    number: 2,
    seasonEpisodeOffset: 12,
    absoluteEpisodeOffset: 24,
    canonicalMappingVerified: true,
  };
  const rows = torrentEpisodes(
    files(
      '[Group] Show - 01 [1080p].mkv',
      'Show - 25.mkv',
      'Show.S02E14.mkv',
      'Show.S01E01.mkv',
      'Show - 37.mkv',
      'NCOP 01.mkv',
    ),
    anime,
    release,
  );
  expect(rows.filter((row) => row.episode).map((row) => row.episode)).toEqual([
    { seasonNumber: 2, episodeNumber: 13, absoluteEpisodeNumber: 25 },
    { seasonNumber: 2, episodeNumber: 13, absoluteEpisodeNumber: 25 },
    { seasonNumber: 2, episodeNumber: 14, absoluteEpisodeNumber: 26 },
  ]);
  expect(rows.filter((row) => !row.episode)).toHaveLength(3);
  expect(
    torrentEpisodes(files('Show.S02E14.mkv'), anime, {
      ...release,
      canonicalMappingVerified: false,
    })[0]?.episode,
  ).toBeNull();
});

test('single movies start directly while multiple unknown videos require a choice', () => {
  expect(
    initialTorrentEpisode(torrentEpisodes(files('Movie.mkv', 'Sample.mp4'), movie), null, true)
      ?.file.name,
  ).toBe('Movie.mkv');
  expect(
    initialTorrentEpisode(torrentEpisodes(files('Movie.mkv', 'Other.mkv'), movie), null, true),
  ).toBeUndefined();
  expect(
    initialTorrentEpisode(torrentEpisodes(files('Unknown.mkv'), series), null, false),
  ).toBeUndefined();
});

test('navigation switches exact file refs, crosses seasons and keeps extras out of Next', async () => {
  const rows = torrentEpisodes(
    files('Show.S02E10.mkv', 'Show.S03E01.mkv', 'Extras/01.mkv'),
    series,
  );
  const picked: string[] = [];
  const navigation = torrentEpisodeNavigation(rows, rows[0]!.file.ref, false, async (row) => {
    picked.push(row.file.ref);
  });
  expect(navigation.seasons?.map((season) => season.id)).toEqual(['2', '3', 'files']);
  await navigation.next!({ signal: new AbortController().signal });
  await navigation.select!(
    { seasonId: 'files', episodeId: rows[2]!.file.ref },
    { signal: new AbortController().signal },
  );
  expect(picked).toEqual([rows[1]!.file.ref, rows[2]!.file.ref]);
  expect(
    torrentEpisodeNavigation(rows, rows[1]!.file.ref, false, async () => {}).next,
  ).toBeUndefined();
  expect(
    torrentEpisodeNavigation(rows, rows[0]!.file.ref, true, async () => {}).seasons,
  ).toBeUndefined();
});
