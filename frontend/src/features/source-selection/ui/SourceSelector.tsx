import type { MediaSourceOption } from '@/entities/media-source';
import { Select } from '@/shared';

import { getSourceLabel } from '../model/sourceSelection';

export type SourceSelectorProps = {
  sources: readonly MediaSourceOption[];
  selectedSourceRef: string | null;
  onSourceChange: (sourceRef: string | null) => void;
  variant?: 'section' | 'toolbar' | 'inline';
  includeDetails?: boolean;
};

export function SourceSelector({
  sources,
  selectedSourceRef,
  onSourceChange,
  variant = 'section',
  includeDetails = true,
}: SourceSelectorProps) {
  const options = sources.map((source) => ({
    value: source.sourceRef,
    label: getSourceLabel(source, includeDetails),
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
