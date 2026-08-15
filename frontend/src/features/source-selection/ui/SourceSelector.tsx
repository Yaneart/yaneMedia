import type { MediaSourceOption } from '@/entities/media-source';
import { Select } from '@/shared';

export type SourceSelectorProps = {
  sources: readonly MediaSourceOption[];
  selectedSourceRef: string | null;
  onSourceChange: (sourceRef: string | null) => void;
  variant?: 'section' | 'toolbar' | 'inline';
};

function getSourceLabel(source: MediaSourceOption) {
  return [source.label, source.translation?.title, source.quality?.label]
    .filter(Boolean)
    .join(' · ');
}

export function SourceSelector({
  sources,
  selectedSourceRef,
  onSourceChange,
  variant = 'section',
}: SourceSelectorProps) {
  const options = sources.map((source) => ({
    value: source.sourceRef,
    label: getSourceLabel(source),
  }));

  const isToolbar = variant !== 'section';

  return (
    <section
      aria-label={isToolbar ? 'Настройки просмотра' : undefined}
      aria-labelledby={isToolbar ? undefined : 'source-selector-title'}
      className={
        variant === 'toolbar'
          ? 'flex flex-col gap-3 bg-surface-elevated px-4 py-3 sm:flex-row sm:items-center sm:px-5'
          : variant === 'inline'
            ? 'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center'
            : ''
      }
    >
      {!isToolbar && (
        <h2 id="source-selector-title" className="text-heading text-text-primary">
          Плеер
        </h2>
      )}

      {variant === 'inline' && (
        <span className="shrink-0 text-caption text-text-secondary">Плеер</span>
      )}

      <div
        className={[
          'flex flex-col gap-3 sm:flex-row sm:items-center',
          isToolbar ? '' : 'mt-4',
        ].join(' ')}
      >
        <Select
          aria-label="Плеер для воспроизведения"
          value={selectedSourceRef}
          options={options}
          placeholder="Выберите плеер"
          onChange={onSourceChange}
          matchMenuWidth
          allowEmpty={false}
          className={
            variant === 'inline'
              ? 'w-full min-w-0 sm:w-56'
              : isToolbar
                ? 'w-full sm:w-80'
                : 'w-full sm:w-96'
          }
        />
      </div>
    </section>
  );
}
