import type { MediaArtwork } from '@/entities/media';
import type { MediaSourceOption } from '@/entities/media-source';
import { ErrorState, IconButton, PlayIcon, Spinner } from '@/shared';

export type MediaPlayerStatus = 'loading' | 'ready' | 'error';

export type MediaPlayerProps = {
  mediaTitle: string;
  backdrop?: MediaArtwork;
  source?: MediaSourceOption;
  isStarted: boolean;
  status: MediaPlayerStatus;
  onStart: () => void;
  onRetry?: () => void;
  embedded?: boolean;
};

function getSourceDescription(source: MediaSourceOption) {
  return [source.translation?.title, source.quality?.label].filter(Boolean).join(' · ');
}

export function MediaPlayer({
  mediaTitle,
  backdrop,
  source,
  isStarted,
  status,
  onStart,
  onRetry,
  embedded = false,
}: MediaPlayerProps) {
  return (
    <section aria-label={`Плеер: ${mediaTitle}`}>
      <div
        className={[
          'relative isolate aspect-video overflow-hidden bg-black',
          embedded ? '' : 'rounded-card border border-border shadow-surface',
        ].join(' ')}
      >
        {!isStarted && backdrop && (
          <img
            src={backdrop.url}
            alt=""
            width={backdrop.width}
            height={backdrop.height}
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        )}

        {!isStarted && <div className="absolute inset-0 -z-10 bg-black/55" />}

        <div className="flex size-full items-center justify-center p-5 text-center sm:p-8">
          {!source && <p className="text-body text-white/70">Выберите плеер для просмотра</p>}

          {source && !isStarted && (
            <div className="flex flex-col items-center">
              <IconButton
                size="custom"
                variant="bare"
                aria-label={`Запустить ${source.label}`}
                className={[
                  'size-16 rounded-full border border-white/30 bg-black/45 text-white',
                  'backdrop-blur-sm hover:border-watermark/80 hover:bg-watermark/25',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/60',
                ].join(' ')}
                onClick={onStart}
              >
                <PlayIcon className="size-7" />
              </IconButton>

              <p className="mt-3 font-semibold text-white">{source.label}</p>
              <p className="mt-1 text-caption text-white/70">{getSourceDescription(source)}</p>
            </div>
          )}

          {source && isStarted && status === 'loading' && (
            <Spinner
              size="large"
              label={`Загрузка плеера ${source.label}`}
              className="[&>span:first-child]:text-white [&>span:first-child>span:last-child]:text-white/60"
            />
          )}

          {source && isStarted && status === 'ready' && (
            <div role="status">
              <p className="text-heading text-white">{source.label}</p>
              <p className="mt-2 text-caption text-white/60">
                Здесь будет встроен iframe выбранного плеера
              </p>
            </div>
          )}

          {source && isStarted && status === 'error' && (
            <ErrorState
              variant="player"
              title="Не удалось загрузить плеер"
              description="Проверьте подключение и попробуйте ещё раз."
              onRetry={onRetry}
              retryLabel="Повторить"
              visualLabel="Плеер недоступен"
            />
          )}
        </div>
      </div>
    </section>
  );
}
