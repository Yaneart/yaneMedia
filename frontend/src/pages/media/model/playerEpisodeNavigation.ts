import type { PlayerEpisodeSelection, PlayerNavigation } from '@yaneart/yaneplayer';
import type { DirectEpisodeOption } from '@/features/source-selection';
import { getDirectEpisodeDisplayNumber } from '@/features/source-selection';

export function createPlayerEpisodeNavigation(
  episodes: readonly DirectEpisodeOption[],
  current: DirectEpisodeOption | undefined,
  flat: boolean,
  select: (episode: DirectEpisodeOption, signal: AbortSignal) => Promise<void>,
): PlayerNavigation {
  const ordered = [...episodes].sort(
    (a, b) =>
      (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
      (getDirectEpisodeDisplayNumber(a) ?? 0) - (getDirectEpisodeDisplayNumber(b) ?? 0),
  );
  const selection = (episode: DirectEpisodeOption): PlayerEpisodeSelection => ({
    ...(!flat && episode.seasonNumber !== undefined
      ? { seasonId: String(episode.seasonNumber) }
      : {}),
    episodeId: episode.key,
  });
  const descriptor = (episode: DirectEpisodeOption) => {
    const label = `${getDirectEpisodeDisplayNumber(episode)} серия`;
    const title = episode.title?.trim();
    return {
      id: episode.key,
      label: title && title.toLocaleLowerCase('ru') !== label ? `${label} · ${title}` : label,
    };
  };
  const index = ordered.findIndex((episode) => episode.key === current?.key);
  return {
    ...(flat
      ? { episodes: ordered.map(descriptor) }
      : {
          seasons: [...new Set(ordered.map((episode) => episode.seasonNumber))].map((number) => ({
            id: String(number),
            label: number === 0 ? 'Спецвыпуски' : `${number} сезон`,
            episodes: ordered.filter((episode) => episode.seasonNumber === number).map(descriptor),
          })),
        }),
    current: current ? selection(current) : null,
    select: async (target, { signal }) => {
      const episode = ordered.find((episode) => {
        const item = selection(episode);
        return item.episodeId === target.episodeId && item.seasonId === target.seasonId;
      });
      if (!episode) throw new Error('Серия недоступна');
      await select(episode, signal);
    },
    previous: index > 0 ? ({ signal }) => select(ordered[index - 1]!, signal) : undefined,
    next:
      index >= 0 && index < ordered.length - 1
        ? ({ signal }) => select(ordered[index + 1]!, signal)
        : undefined,
  };
}
