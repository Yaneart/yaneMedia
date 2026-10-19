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
    .normalize('NFKC')
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
  if (match < 0.5) {
    score -= 75;
    reasons.push('title_mismatch');
  }
  const years = [...release.title.matchAll(/\b(?:19|20)\d{2}\b/g)].map(([value]) => Number(value));
  if (identity.year && years.length) {
    if (years.includes(identity.year)) {
      score += 18;
      reasons.push('year_match');
    } else {
      score -= 25;
      reasons.push('year_mismatch');
    }
  }
  const seasonEpisode = /\bS(\d{1,2})\s*E(\d{1,3})\b/i.exec(release.title);
  const seasonOnly = /\b(?:S|season\s*)(\d{1,2})\b/i.exec(release.title);
  const season = seasonEpisode
    ? Number(seasonEpisode[1])
    : seasonOnly
      ? Number(seasonOnly[1])
      : null;
  const episode = seasonEpisode ? Number(seasonEpisode[2]) : null;
  if (identity.kind === 'movie' && season !== null) {
    score -= 35;
    reasons.push('type_mismatch');
  }
  if (identity.season !== undefined && season !== null) {
    if (season === identity.season) {
      score += 14;
      reasons.push('season_match');
    } else {
      score -= 60;
      reasons.push('season_mismatch');
    }
  }
  if (identity.episode !== undefined && episode !== null) {
    if (episode === identity.episode) {
      score += 12;
      reasons.push('episode_match');
    } else {
      score -= 45;
      reasons.push('episode_mismatch');
    }
  }
  const resolution =
    /\b(2160p|1080p|720p|480p|4k)\b/i.exec(release.title)?.[1]?.toLowerCase() ?? null;
  const quality =
    /\b(BluRay|WEB[- .]?DL|WEBRip|HDTV|CAM|TS)\b/i.exec(release.title)?.[1]?.toUpperCase() ?? null;
  if (quality === 'CAM' || quality === 'TS') {
    score -= 40;
    reasons.push('low_quality');
  } else if (quality || resolution) {
    score += 8;
    reasons.push('quality_label');
  }
  const voice =
    /\b(DUB|MVO|DVO|AVO|VO)\b/i.exec(release.title)?.[1]?.toUpperCase() ??
    (/Лицензия/i.test(release.title) ? 'Лицензия' : null);
  const studio =
    /(?:^|[^\p{L}\p{N}])(Кубик в Кубе|LostFilm|NewStudio|HDRezka Studio|AniLibria|AniDub)(?=$|[^\p{L}\p{N}])/iu.exec(
      release.title,
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
      score -= 20;
      reasons.push('no_seeders');
    } else {
      score += Math.min(15, Math.floor(Math.log2(release.seeders + 1) * 3));
      reasons.push('seeders');
    }
  }
  const maxSize = identity.kind === 'movie' ? 35 * 1024 ** 3 : 100 * 1024 ** 3;
  if (release.size > maxSize) {
    score -= 25;
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

export function dedupeReleases(releases: DiscoveryRelease[]): DiscoveryRelease[] {
  const seen = new Set<string>();
  return releases.filter((release) => {
    const key = release.infoHash
      ? `hash:${release.infoHash.toLowerCase()}`
      : release.guid
        ? `guid:${release.tracker.toLowerCase()}:${release.guid}`
        : `attrs:${normalize(release.title)}:${release.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
