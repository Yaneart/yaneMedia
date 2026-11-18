import type { DiscoveryRelease } from './torrent-discovery.port';

export interface SearchIdentity {
  titles: string[];
  year?: number;
  kind: 'movie' | 'tv' | 'anime';
  season?: number;
  episode?: number;
}

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const tokens = (value: string) =>
  normalize(value)
    .split(' ')
    .filter((token) => token.length > 1);

export function rankRelease(release: DiscoveryRelease, identity: SearchIdentity) {
  const title = normalize(release.title);
  const words = new Set(tokens(release.title));
  const match = Math.max(
    ...identity.titles.map((name) => {
      const wanted = tokens(name);
      return wanted.length ? wanted.filter((word) => words.has(word)).length / wanted.length : 0;
    }),
  );
  const reasons: string[] = [];
  let score = Math.round(match * 70);
  if (match >= 0.8) reasons.push('title_match');
  if (match < 0.6) {
    score -= 75;
    reasons.push('title_mismatch');
  }
  const titleYears = new Set(
    identity.titles.flatMap((name) => name.match(/\b(?:19|20)\d{2}\b/g) ?? []),
  );
  const years = release.year
    ? [release.year]
    : [...release.title.matchAll(/\b(?:19|20)\d{2}\b/g)]
        .filter(([value]) => !titleYears.has(value))
        .map(([value]) => Number(value));
  if (identity.year && years.length) {
    if (years.includes(identity.year)) {
      score += 18;
      reasons.push('year_match');
    } else if (identity.kind === 'movie') {
      score -= 25;
      reasons.push('year_mismatch');
    }
  }
  const seasonEpisode = /\bS(\d{1,2})\s*E(\d{1,3})(?:\s*[-–]\s*(?:E)?(\d{1,3}))?\b/i.exec(
    release.title,
  );
  const seasonOnly =
    /\b(?:S|season\s*)(\d{1,2})(?:\s*[-–]\s*S?(\d{1,2}))?\b/i.exec(release.title) ??
    /сезон(?:ы)?\s*[:-]?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/iu.exec(release.title) ??
    /\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*сезон/iu.exec(release.title);
  const season = seasonEpisode
    ? Number(seasonEpisode[1])
    : seasonOnly
      ? Number(seasonOnly[1])
      : release.seasons?.length === 1
        ? release.seasons[0]
        : null;
  const episode = seasonEpisode ? Number(seasonEpisode[2]) : null;
  if (
    (identity.kind === 'movie' && (season !== null || release.kind === 'tv')) ||
    (identity.kind === 'tv' && release.kind === 'movie')
  ) {
    score -= 35;
    reasons.push('type_mismatch');
  }
  const seasonEnd = Number(seasonOnly?.[2] ?? season);
  const seasons = release.seasons?.length
    ? release.seasons
    : season === null
      ? []
      : Array.from(
          { length: Math.max(1, Math.min(100, seasonEnd - season + 1)) },
          (_, i) => season + i,
        );
  if (identity.season !== undefined && seasons.length) {
    if (seasons.includes(identity.season)) {
      score += 14;
      reasons.push('season_match');
    } else {
      score -= 60;
      reasons.push('season_mismatch');
    }
  }
  if (identity.episode !== undefined && episode !== null) {
    const episodeEnd = Number(seasonEpisode?.[3] ?? episode);
    if (identity.episode >= episode && identity.episode <= Math.max(episode, episodeEnd)) {
      score += 12;
      reasons.push('episode_match');
    } else {
      score -= 45;
      reasons.push('episode_mismatch');
    }
  }
  const resolutionMatch = /\b(4320|2160|1440|1080|720|576|480|360)[pi]\b|\b(8k|4k|uhd|fhd)\b/i.exec(
    release.title,
  );
  const aliases: Record<string, number> = { '8k': 4320, '4k': 2160, uhd: 2160, fhd: 1080 };
  const height =
    release.resolution ??
    (resolutionMatch ? Number(resolutionMatch[1]) || aliases[resolutionMatch[2].toLowerCase()] : 0);
  const resolution = height ? `${height}p` : null;
  // A work named "Cam" is not a camera release. Remove trusted names before reading tags.
  let technicalTitle = release.title;
  for (const name of identity.titles)
    technicalTitle = technicalTitle.replace(
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'),
      ' ',
    );
  const qualityTag =
    /\b(HDCAM|CAMRip|CAM|HDTS|TELESYNC|TS|TELECINE|TC|WORKPRINT)\b/i.exec(technicalTitle)?.[1] ??
    /\b(BD[- .]?Remux|BDRip|Blu[- ]?Ray|Remux|HDRip|WEB[- .]?DL(?:Rip)?|WEBRip|HDTV|DVD[- .]?Rip)\b/i.exec(
      technicalTitle,
    )?.[1];
  const quality = qualityTag
    ? qualityTag
        .toUpperCase()
        .replace(/[ .-]/g, '')
        .replace(/^WEBDL$/, 'WEB-DL')
    : null;
  if (quality && /^(?:HDCAM|CAMRIP|CAM|HDTS|TELESYNC|TS|TELECINE|TC|WORKPRINT)$/.test(quality)) {
    score -= 100;
    reasons.push('low_quality');
  } else {
    const sourceBonus: Record<string, number> = {
      BDREMUX: 20,
      REMUX: 20,
      BLURAY: 20,
      'WEB-DL': 18,
      BDRIP: 16,
      WEBRIP: 10,
      WEBDLRIP: 7,
      HDTV: 5,
      HDRIP: 2,
      DVDRIP: 0,
    };
    score += quality ? (sourceBonus[quality] ?? 0) : 0;
    const band = [2160, 1440, 1080, 720].findIndex((minimum) => height >= minimum);
    const bonuses = [20, 23, 25, 5];
    score += band >= 0 ? bonuses[band] : height ? -25 : -5;
    if (quality || resolution) reasons.push('quality_label');
  }
  const voiceTitle = `${release.title} ${(release.voices ?? []).join(' ')}`;
  const voiceLabel =
    /(?:^|[^\p{L}\p{N}])(DUB|MVO|DVO|AVO|VO|МВО|ДВО|АВО|Лицензия|Дубляж)(?=$|[^\p{L}\p{N}])/iu.exec(
      voiceTitle,
    )?.[1] ?? null;
  const voice =
    voiceLabel?.toLowerCase() === 'лицензия' ? 'Лицензия' : (voiceLabel?.toUpperCase() ?? null);
  const studio =
    /(?:^|[^\p{L}\p{N}])(Кубик в Кубе|LostFilm|NewStudio|HDRezka(?: Studio)?|AniLibria|AniDub|Red Head Sound|Bravo Records Georgia|Kubik|RuDub|Jaskier|NewComers|TVShows|WinMedia|Ю(?:рий|\.) Сербин)(?=$|[^\p{L}\p{N}])/iu.exec(
      voiceTitle,
    )?.[1] ?? null;
  const russianSubtitles = /rus(?:sian)?[ ._-]?sub|рус(?:ские)?[ ._-]?субтитры/i.test(
    release.title,
  );
  if (voice) {
    score += 8;
    reasons.push('russian_voice_claim');
  }
  if (studio) {
    score += 3;
    reasons.push('studio_claim');
  }
  if (russianSubtitles) reasons.push('russian_subtitles_claim');
  if (release.seeders !== null) {
    if (release.seeders === 0) {
      score -= 30;
      reasons.push('no_seeders');
    } else {
      score += Math.min(24, Math.round(Math.log2(release.seeders + 1) * 2));
      reasons.push('seeders');
    }
  }
  if (identity.kind === 'movie' && release.size > 15 * 1024 ** 3) {
    score -= Math.min(18, Math.round(Math.log2(release.size / (15 * 1024 ** 3)) * 8));
    reasons.push('large_size');
  }
  if (release.size > 200 * 1024 ** 3) {
    score -= 100;
    reasons.push('size_limit');
  }
  const rawAgeDays = release.publishedAt
    ? Math.floor((Date.now() - Date.parse(release.publishedAt)) / 86_400_000)
    : null;
  const ageDays = rawAgeDays !== null && rawAgeDays >= 0 ? rawAgeDays : null;
  if (ageDays !== null) {
    if (ageDays < 30) {
      score += 3;
      reasons.push('recent');
    }
  }
  if (/\b(?:password|sample|trailer|fake)\b/i.test(title)) {
    score -= 50;
    reasons.push('suspicious_title');
  }
  return {
    score,
    reasons,
    quality,
    resolution,
    voice,
    studio,
    russianSubtitles,
    season,
    episode,
    ageDays,
  };
}

export type RankedRelease = { release: DiscoveryRelease; rank: ReturnType<typeof rankRelease> };
export const compareRanked = (a: RankedRelease, b: RankedRelease) =>
  b.rank.score - a.rank.score ||
  a.release.tracker.localeCompare(b.release.tracker, 'ru') ||
  a.release.title.localeCompare(b.release.title, 'ru') ||
  a.release.size - b.release.size;

export function dedupeReleases(releases: DiscoveryRelease[]): DiscoveryRelease[] {
  const positions = new Map<string, number>();
  const unique: DiscoveryRelease[] = [];
  for (const release of releases) {
    const key = release.infoHash
      ? `hash:${release.tracker.toLowerCase()}:${release.infoHash.toLowerCase()}`
      : release.guid
        ? `guid:${release.tracker.toLowerCase()}:${release.guid}`
        : `attrs:${release.tracker.toLowerCase()}:${normalize(release.title)}:${release.size}`;
    const index = positions.get(key);
    if (index === undefined) {
      positions.set(key, unique.length);
      unique.push(release);
    } else if (unique[index].stale && !release.stale) unique[index] = release;
  }
  return unique;
}
