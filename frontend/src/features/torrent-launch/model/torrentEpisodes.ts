import type { AnimeSeasonChainEntry, MediaDetails } from '@/entities/media';
import type { PlaybackEpisodeSelection } from '@/entities/playback';
import type { TorrentFile } from '@/entities/torrent-session';

export type TorrentEpisode = {
  file: TorrentFile;
  label: string;
  episode: PlaybackEpisodeSelection | null;
  ambiguous?: boolean;
  supplemental?: boolean;
};

export function sameTorrentEpisode(
  a: PlaybackEpisodeSelection | null | undefined,
  b: PlaybackEpisodeSelection | null | undefined,
) {
  return !!a && !!b && a.episodeNumber === b.episodeNumber && a.seasonNumber === b.seasonNumber;
}

// A number is evidence only in an episode marker, a season folder, or a
// numbered anime release. Years, resolutions and multi-episode files are not.
export function torrentEpisodes(
  files: readonly TorrentFile[],
  media: MediaDetails,
  release?: Pick<
    AnimeSeasonChainEntry,
    'number' | 'seasonEpisodeOffset' | 'absoluteEpisodeOffset' | 'canonicalMappingVerified'
  >,
): TorrentEpisode[] {
  const movie = media.type === 'movie' || (media.type === 'anime' && media.animeKind === 'movie');
  const seasons =
    media.type === 'series' ? media.seasons.filter((season) => season.number > 0) : [];
  const rows = files.map((file): TorrentEpisode => {
    const path = file.name.replace(/\\/g, '/');
    const name = path
      .split('/')
      .at(-1)!
      .replace(/\.[^.]+$/, '');
    let episode: PlaybackEpisodeSelection | null = null;
    const extra =
      /(?:^|[\s/._[(-])(?:sample|trailer|extras?|specials?|ova|oad|ncop|nced|opening|ending|bonus|pv|спецвыпуски?|доп(?:олнения)?|трейлер)(?:$|[\s/._\])\d-])/i.test(
        path,
      );
    const multiple =
      /^\d{1,3}\s*[-+&]\s*\d{1,3}(?:\D|$)/.test(name) ||
      /(?:s\d{1,2}e\d{1,3}|\d{1,2}x\d{1,3}|(?:episode|ep|серия)[ ._-]*\d{1,3})[ ._-]*(?:e\d|[-+&]\s*(?:e)?\d)/i.test(
        name,
      );
    const explicit = [
      ...path.matchAll(/(?:^|[^a-z\d])(?:s(\d{1,2})[ ._-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))(?!\d)/gi),
    ];
    const folderSeasons = [
      ...path
        .slice(0, path.lastIndexOf('/') + 1)
        .matchAll(
          /(?:^|[\s/._-])(?:(?:s|season[ ._-]*|сезон[ ._-]*)(\d{1,2})|(\d{1,2})[ ._-]*сезон)(?=$|[\s/._-])/gi,
        ),
    ].map((match) => Number(match[1] ?? match[2]));
    const number =
      name.match(/(?:^|[\s._[(-])(?:episode|ep|e|серия)[ ._-]*(\d{1,3})(?!\d)/i) ??
      name.match(/^(\d{1,3})(?:$|[ ._-])/) ??
      (media.type === 'anime'
        ? name.replace(/\[[^\]]*\]/g, '').match(/(?:^|\s-\s)(\d{1,3})(?:\s|$)/)
        : null);
    if (!movie && !extra && !multiple) {
      if (explicit.length === 1) {
        const match = explicit[0]!;
        episode = {
          seasonNumber: Number(match[1] ?? match[3]),
          episodeNumber: Number(match[2] ?? match[4]),
        };
        if (folderSeasons.some((season) => season !== episode!.seasonNumber)) episode = null;
      } else if (explicit.length === 0 && number) {
        const season = [...new Set(folderSeasons)];
        const inferred =
          season.length === 1 ? season[0] : seasons.length === 1 ? seasons[0]!.number : undefined;
        if (inferred !== undefined || media.type === 'anime')
          episode = {
            ...(inferred !== undefined ? { seasonNumber: inferred } : {}),
            episodeNumber: Number(number[1]),
          };
      }
      if (episode && (episode.episodeNumber < 1 || episode.seasonNumber === 0)) episode = null;
      if (episode && media.type === 'anime') {
        const offset = release?.canonicalMappingVerified ? release : undefined;
        const count = media.episodesCount ?? media.episodes.length;
        let local = episode.episodeNumber;
        if (episode.seasonNumber !== undefined) {
          if (!offset || episode.seasonNumber !== offset.number) episode = null;
          else local -= offset.seasonEpisodeOffset;
        } else if (offset && local > count && count > 0) local -= offset.absoluteEpisodeOffset;
        if (episode && (local < 1 || (count > 0 && local > count))) episode = null;
        if (episode)
          episode = {
            ...(offset
              ? {
                  seasonNumber: offset.number,
                  absoluteEpisodeNumber: offset.absoluteEpisodeOffset + local,
                }
              : {}),
            episodeNumber: offset ? offset.seasonEpisodeOffset + local : local,
          };
      }
    }
    return {
      file,
      episode,
      ...(extra ? { supplemental: true } : {}),
      label: episode
        ? `${episode.episodeNumber - (media.type === 'anime' && release?.canonicalMappingVerified ? release.seasonEpisodeOffset : 0)} серия`
        : file.name,
    };
  });
  // Duplicate encodes cannot silently choose a file on behalf of the viewer.
  const counts = new Map<string, number>();
  for (const row of rows)
    if (row.episode) {
      const key = JSON.stringify([row.episode.seasonNumber, row.episode.episodeNumber]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return rows
    .map((row) =>
      row.episode &&
      counts.get(JSON.stringify([row.episode.seasonNumber, row.episode.episodeNumber]))! > 1
        ? { ...row, ambiguous: true, label: row.file.name }
        : row,
    )
    .sort(
      (a, b) =>
        Number(!a.episode) - Number(!b.episode) ||
        (a.episode?.seasonNumber ?? 0) - (b.episode?.seasonNumber ?? 0) ||
        (a.episode?.episodeNumber ?? 0) - (b.episode?.episodeNumber ?? 0) ||
        a.file.name.localeCompare(b.file.name, 'ru', { numeric: true }),
    );
}

export function initialTorrentEpisode(
  rows: readonly TorrentEpisode[],
  requested: PlaybackEpisodeSelection | null,
  movie: boolean,
): TorrentEpisode | undefined {
  return requested
    ? rows.find((row) => !row.ambiguous && sameTorrentEpisode(row.episode, requested))
    : (rows.find((row) => row.episode && !row.ambiguous) ??
        (movie && rows.filter((row) => !row.supplemental).length === 1
          ? rows.find((row) => !row.supplemental)
          : undefined));
}
