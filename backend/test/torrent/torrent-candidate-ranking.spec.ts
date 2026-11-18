import { rankRelease } from '../../src/torrent/torrent-candidate-ranking';
import type { DiscoveryRelease } from '../../src/torrent/torrent-discovery.port';

const base: DiscoveryRelease = {
  guid: null,
  title: 'Arrival 2016 1080p WEB-DL DUB',
  tracker: 'Rutor',
  size: 8 * 1024 ** 3,
  seeders: 30,
  publishedAt: null,
  downloadUrl: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
  infoHash: null,
};
const movie = { titles: ['Arrival'], kind: 'movie' as const, year: 2016 };
const series = { titles: ['Severance'], kind: 'tv' as const, year: 2022, season: 2, episode: 5 };

describe('quality-aware torrent selection', () => {
  it('ranks a healthy 1080p release above a very popular SD rip', () => {
    const sd = { ...base, title: 'Arrival 2016 480p HDRip DUB', seeders: 10000 };
    expect(rankRelease(base, movie).score).toBeGreaterThan(rankRelease(sd, movie).score);
  });

  it('prefers practical 1080p while retaining the 4K quality label', () => {
    const remux = { ...base, title: 'Arrival 2016 2160p BDRemux DUB', size: 70 * 1024 ** 3 };
    expect(rankRelease(base, movie).score).toBeGreaterThan(rankRelease(remux, movie).score);
    expect(rankRelease(remux, movie).resolution).toBe('2160p');
  });

  it('continues distinguishing 30, 300 and 3000 seeders', () => {
    const scores = [30, 300, 3000].map((seeders) => rankRelease({ ...base, seeders }, movie).score);
    expect(scores[0]).toBeLessThan(scores[1]);
    expect(scores[1]).toBeLessThan(scores[2]);
  });

  it('uses structured resolution and voices when title tags are missing', () => {
    const rank = rankRelease(
      { ...base, title: 'Arrival 2016', resolution: 1080, voices: ['Дубляж', 'LostFilm'] },
      movie,
    );
    expect(rank).toMatchObject({ resolution: '1080p', voice: 'ДУБЛЯЖ', studio: 'LostFilm' });
    expect(rank.reasons).toContain('russian_voice_claim');
  });

  it.each(['HDCAM', 'CAMRip', 'HDTS', 'TC', 'TELESYNC', 'CAM', 'WORKPRINT'])(
    'recognizes %s even alongside misleading HD and WEB-DL labels',
    (tag) => {
      expect(
        rankRelease({ ...base, title: `Arrival 2016 1080p WEB-DL ${tag}` }, movie).reasons,
      ).toContain('low_quality');
    },
  );

  it('does not mistake the movie Cam for a camera release', () => {
    expect(
      rankRelease(
        { ...base, title: 'Cam 2018 1080p WEB-DL' },
        { titles: ['Cam'], kind: 'movie', year: 2018 },
      ).reasons,
    ).not.toContain('low_quality');
  });

  it('accepts seasons and episode ranges, including later-season release years', () => {
    for (const title of [
      'Severance 2025 S02E01-10 1080p',
      'Severance 2025 S01-S03 1080p',
      'Severance 2025 Сезоны 1-3 1080p',
    ]) {
      const rank = rankRelease({ ...base, title }, series);
      expect(rank.reasons).not.toEqual(expect.arrayContaining(['year_mismatch']));
      expect(rank.reasons).toContain('season_match');
      expect(rank.reasons).not.toContain('episode_mismatch');
    }
  });

  it('rejects explicit conflicting coordinates without guessing when season is unknown', () => {
    expect(rankRelease({ ...base, title: 'Severance S01E05 1080p' }, series).reasons).toContain(
      'season_mismatch',
    );
    expect(rankRelease({ ...base, title: 'Severance S02E01-04 1080p' }, series).reasons).toContain(
      'episode_mismatch',
    );
    expect(rankRelease({ ...base, title: 'Severance 1080p' }, series).reasons).not.toContain(
      'season_mismatch',
    );
    expect(rankRelease({ ...base, title: 'Severance', seasons: [1] }, series).reasons).toContain(
      'season_mismatch',
    );
  });

  it('does not interpret a numeric part of a title as a conflicting release year', () => {
    expect(
      rankRelease(
        { ...base, title: 'Blade Runner 2049 1080p' },
        { titles: ['Blade Runner 2049'], kind: 'movie', year: 2017 },
      ).reasons,
    ).not.toContain('year_mismatch');
    expect(rankRelease({ ...base, title: 'Arrival 1996 1080p' }, movie).reasons).toContain(
      'year_mismatch',
    );
  });
});
