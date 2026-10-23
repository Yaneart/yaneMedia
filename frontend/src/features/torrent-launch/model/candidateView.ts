import type { TorrentCandidate } from '@/entities/torrent-session';

export type CandidateSort = 'best' | 'newest' | 'seeders';
export type CandidateFilters = {
  tracker: string;
  resolution: string;
  quality: string;
  voice: string;
  seededOnly: boolean;
};

export const emptyCandidateFilters: CandidateFilters = {
  tracker: '',
  resolution: '',
  quality: '',
  voice: '',
  seededOnly: false,
};

export const unknownLabel = 'Не указано';
const label = (value: string | null) => value || unknownLabel;
export const candidateVoice = (item: TorrentCandidate) => label(item.voice ?? item.studio);

export function candidateTrackerLabel(tracker: string) {
  const names: Record<string, string> = {
    'rutracker.org': 'RuTracker',
    'noname club': 'NNM-Club',
    bigfangroup: 'BigFAN',
  };
  return names[tracker.trim().toLowerCase()] ?? tracker;
}

function resolutionHeight(value: string) {
  const aliases: Record<string, number> = {
    '8k': 4320,
    '4k': 2160,
    '2k': 1440,
    uhd: 2160,
    fhd: 1080,
    hd: 720,
    sd: 480,
  };
  const normalized = value.trim().toLowerCase();
  return aliases[normalized] ?? Number(normalized.match(/^(\d{3,4})[pi]?$/)?.[1] ?? 0);
}

export function candidateOptions(
  items: readonly TorrentCandidate[],
  field: 'tracker' | 'resolution' | 'quality' | 'voice',
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = field === 'voice' ? candidateVoice(item) : label(item[field]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) =>
      field === 'resolution'
        ? resolutionHeight(b) - resolutionHeight(a) || b.localeCompare(a, 'ru')
        : a.localeCompare(b, 'ru'),
    )
    .map(([value, count]) => ({ value, count }));
}

function knownDescending(a: number | null, b: number | null) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

export function selectCandidates(
  items: readonly TorrentCandidate[],
  sort: CandidateSort,
  filters: CandidateFilters,
) {
  return items
    .filter(
      (item) =>
        (!filters.tracker || label(item.tracker) === filters.tracker) &&
        (!filters.resolution || label(item.resolution) === filters.resolution) &&
        (!filters.quality || label(item.quality) === filters.quality) &&
        (!filters.voice || candidateVoice(item) === filters.voice) &&
        (!filters.seededOnly || (item.seeders !== null && item.seeders > 0)),
    )
    .sort((a, b) => {
      const primary =
        sort === 'newest'
          ? knownDescending(
              a.publishedAt ? Date.parse(a.publishedAt) : null,
              b.publishedAt ? Date.parse(b.publishedAt) : null,
            )
          : sort === 'seeders'
            ? knownDescending(a.seeders, b.seeders)
            : 0;
      return (
        primary ||
        b.score - a.score ||
        a.tracker.localeCompare(b.tracker, 'ru') ||
        a.title.localeCompare(b.title, 'ru') ||
        a.size - b.size
      );
    });
}
