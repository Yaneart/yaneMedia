import type { MediaSeason } from '@/entities/media';
import { Select } from '@/shared';

export type SeasonSelectorProps = {
  seasons: readonly MediaSeason[];
  selectedSeasonNumber: number | null;
  onSeasonChange: (seasonNumber: number) => void;
  variant?: 'section' | 'inline';
};

function getSeasonLabel(season: MediaSeason) {
  return season.title ?? `${season.number} сезон`;
}

export function SeasonSelector({
  seasons,
  selectedSeasonNumber,
  onSeasonChange,
  variant = 'section',
}: SeasonSelectorProps) {
  const options = seasons.map((season) => ({
    value: season.number.toString(),
    label: getSeasonLabel(season),
  }));

  return (
    <section
      aria-label="Выбор сезона"
      className={[
        'flex flex-col gap-3 sm:flex-row sm:items-center',
        variant === 'section'
          ? 'border-b border-context-border bg-surface-elevated px-4 py-3 sm:px-5'
          : '',
      ].join(' ')}
    >
      <span className="shrink-0 text-caption text-text-secondary">Сезон</span>

      <Select
        aria-label="Сезон для просмотра"
        value={selectedSeasonNumber?.toString() ?? null}
        options={options}
        placeholder="Выберите сезон"
        onChange={(value) => {
          if (value !== null) onSeasonChange(Number(value));
        }}
        matchMenuWidth
        allowEmpty={false}
        className="w-full sm:w-48"
      />
    </section>
  );
}
