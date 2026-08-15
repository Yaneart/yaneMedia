import type { MediaSourceAvailability, MediaSourceOption } from '@/entities/media-source';
import { Select } from '@/shared';

export type SourceSelectorProps = {
  sources: readonly MediaSourceOption[];
  selectedSourceRef: string | null;
  onSourceChange: (sourceRef: string | null) => void;
};

const availabilityLabels = {
  available: 'Доступно',
  unknown: 'Доступность не подтверждена',
} satisfies Record<MediaSourceAvailability, string>;

function getSourceLabel(source: MediaSourceOption) {
  return [source.label, source.translation?.title, source.quality?.label]
    .filter(Boolean)
    .join(' · ');
}

export function SourceSelector({
  sources,
  selectedSourceRef,
  onSourceChange,
}: SourceSelectorProps) {
  const selectedSource = sources.find((source) => source.sourceRef === selectedSourceRef);
  const options = sources.map((source) => ({
    value: source.sourceRef,
    label: getSourceLabel(source),
  }));

  return (
    <section aria-labelledby="source-selector-title" className="max-w-6xl">
      <h2 id="source-selector-title" className="text-heading text-text-primary">
        Плеер
      </h2>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          aria-label="Плеер для воспроизведения"
          value={selectedSourceRef}
          options={options}
          placeholder="Выберите плеер"
          onChange={onSourceChange}
          className="w-full sm:w-auto sm:min-w-80"
        />

        {selectedSource && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <span
                aria-hidden="true"
                className={[
                  'size-2 rounded-full',
                  selectedSource.availability === 'available' ? 'bg-success' : 'bg-text-disabled',
                ].join(' ')}
              />
              {availabilityLabels[selectedSource.availability]}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
