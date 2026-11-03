import type { PlayerNavigation } from '@yaneart/yaneplayer';
import type { TorrentEpisode } from '@/features/torrent-launch';

export function torrentEpisodeNavigation(
  rows: readonly TorrentEpisode[],
  fileRef: string | null,
  flat: boolean,
  select: (row: TorrentEpisode, signal: AbortSignal) => Promise<void>,
): PlayerNavigation {
  const target = (row: TorrentEpisode) => ({
    ...(!flat ? { seasonId: row.episode ? String(row.episode.seasonNumber) : 'files' } : {}),
    episodeId: row.file.ref,
  });
  const descriptor = (row: TorrentEpisode) => ({ id: row.file.ref, label: row.label });
  const current = rows.find((row) => row.file.ref === fileRef);
  const ordered = rows.filter((row) => row.episode);
  const index = ordered.findIndex((row) => row.file.ref === fileRef);
  const differentEpisode = (row: TorrentEpisode) =>
    row.episode?.seasonNumber !== current?.episode?.seasonNumber ||
    row.episode?.episodeNumber !== current?.episode?.episodeNumber;
  const previous = ordered.slice(0, index).reverse().find(differentEpisode);
  const next = index < 0 ? undefined : ordered.slice(index + 1).find(differentEpisode);
  return {
    ...(flat
      ? { episodes: rows.map(descriptor) }
      : {
          seasons: [...new Set(rows.map((row) => target(row).seasonId!))].map((id) => ({
            id,
            label: id === 'files' ? 'Другие файлы' : `${id} сезон`,
            episodes: rows.filter((row) => target(row).seasonId === id).map(descriptor),
          })),
        }),
    current: current ? target(current) : null,
    autoAdvance: true,
    select: async (selection, { signal }) => {
      const row = rows.find(
        (row) =>
          row.file.ref === selection.episodeId && target(row).seasonId === selection.seasonId,
      );
      if (!row) throw new Error('Файл недоступен');
      await select(row, signal);
    },
    previous:
      index > 0 && previous && !previous.ambiguous
        ? ({ signal }) => select(previous, signal)
        : undefined,
    next: next && !next.ambiguous ? ({ signal }) => select(next, signal) : undefined,
  };
}
