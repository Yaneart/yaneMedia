import type { MediaEpisode } from '@/entities/media';
import { Select } from '@/shared';

export type EpisodeSelectorProps = {
  episodes: readonly MediaEpisode[];
  selectedEpisodeNumber: number | null;
  onEpisodeChange: (episodeNumber: number) => void;
  variant?: 'section' | 'inline';
};

function getEpisodeLabel(episode: MediaEpisode) {
  return `${episode.episodeNumber} серия`;
}

export function EpisodeSelector({
  episodes,
  selectedEpisodeNumber,
  onEpisodeChange,
  variant = 'section',
}: EpisodeSelectorProps) {
  const options = episodes.map((episode) => ({
    value: episode.episodeNumber.toString(),
    label: getEpisodeLabel(episode),
  }));

  return (
    <section
      aria-label="Выбор серии"
      className={[
        'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center',
        variant === 'section'
          ? 'border-b border-context-border bg-surface-elevated px-4 py-3 sm:px-5'
          : '',
      ].join(' ')}
    >
      <span className="shrink-0 text-caption text-text-secondary">Серия</span>

      <Select
        aria-label="Серия для просмотра"
        value={selectedEpisodeNumber?.toString() ?? null}
        options={options}
        placeholder="Выберите серию"
        onChange={(value) => {
          if (value !== null) onEpisodeChange(Number(value));
        }}
        matchMenuWidth
        allowEmpty={false}
        className="w-full min-w-0 sm:w-40"
      />
    </section>
  );
}
