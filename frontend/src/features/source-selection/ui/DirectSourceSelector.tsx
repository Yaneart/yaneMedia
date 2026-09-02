import { Select, type SelectOption } from '@/shared';

export type DirectSourceSelectorProps = {
  tracks: readonly SelectOption[];
  selectedTrackKey: string | null;
  onTrackChange: (trackKey: string) => void;
  qualities: readonly SelectOption[];
  selectedQualityKey: string | null;
  onQualityChange: (qualityKey: string) => void;
  compactDesktop?: boolean;
  isLoading?: boolean;
  showQuality?: boolean;
};

export function DirectSourceSelector({
  tracks,
  selectedTrackKey,
  onTrackChange,
  qualities,
  selectedQualityKey,
  onQualityChange,
  compactDesktop = false,
  isLoading = false,
  showQuality = true,
}: DirectSourceSelectorProps) {
  return (
    <div className="contents">
      <section
        aria-label="Выбор озвучки"
        className={[
          'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center',
          compactDesktop ? 'min-[70rem]:shrink-0' : '',
        ].join(' ')}
      >
        <span className="shrink-0 text-caption text-text-secondary">Озвучка</span>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Select
            aria-label="Озвучка для просмотра"
            value={selectedTrackKey}
            options={tracks}
            placeholder="Выберите озвучку"
            onChange={(value) => {
              if (value !== null) onTrackChange(value);
            }}
            matchMenuWidth
            allowEmpty={false}
            className={['w-full min-w-0 sm:w-56', compactDesktop ? 'min-[70rem]:w-48' : ''].join(
              ' ',
            )}
          />

          <span className="inline-flex size-4 shrink-0 items-center justify-center">
            {isLoading && (
              <span
                role="status"
                aria-live="polite"
                aria-label="Ищем другие озвучки"
                className="size-3 animate-spin rounded-full border-2 border-border border-t-action motion-reduce:animate-none"
              />
            )}
          </span>
        </div>
      </section>

      {showQuality && (
        <section
          aria-label="Выбор качества"
          className={[
            'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center',
            compactDesktop ? 'min-[70rem]:shrink-0' : '',
          ].join(' ')}
        >
          <span className="shrink-0 text-caption text-text-secondary">Качество</span>

          <Select
            aria-label="Качество видео"
            value={selectedQualityKey}
            options={qualities}
            placeholder="Выберите качество"
            onChange={(value) => {
              if (value !== null) onQualityChange(value);
            }}
            matchMenuWidth
            allowEmpty={false}
            className={['w-full min-w-0 sm:w-36', compactDesktop ? 'min-[70rem]:w-40' : ''].join(
              ' ',
            )}
          />
        </section>
      )}
    </div>
  );
}
