import type {
  PlaybackArtworkSnapshot,
  PlaybackEpisodeSelection,
  PlaybackSession,
} from '@/entities/playback';
import { CloseIcon, PlayIcon } from '@/shared';

export type WatchDockProps = {
  mediaTitle: string;
  artwork?: PlaybackArtworkSnapshot;
  session: PlaybackSession;
  variant?: 'compact' | 'sidebar';
  onExpand: () => void;
  onClose: () => void;
};

function formatPlaybackTime(totalSeconds: number) {
  const normalizedSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getEpisodeLabel(episode: PlaybackEpisodeSelection | null) {
  if (!episode) return null;

  return [
    episode.seasonNumber !== undefined ? `${episode.seasonNumber} сезон` : null,
    `${episode.episodeNumber} серия`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function WatchDock({
  mediaTitle,
  artwork,
  session,
  variant = 'compact',
  onExpand,
  onClose,
}: WatchDockProps) {
  const episodeLabel = getEpisodeLabel(session.episode);
  const durationSeconds = session.durationSeconds;
  const hasKnownDuration =
    durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0;
  const rawPositionSeconds = Number.isFinite(session.positionSeconds) ? session.positionSeconds : 0;
  const positionSeconds = Math.max(
    0,
    hasKnownDuration ? Math.min(rawPositionSeconds, durationSeconds) : rawPositionSeconds,
  );
  const positionLabel = formatPlaybackTime(positionSeconds);
  const durationLabel = hasKnownDuration ? formatPlaybackTime(durationSeconds) : null;
  const progressPercent = hasKnownDuration ? (positionSeconds / durationSeconds) * 100 : 0;
  const isPortraitArtwork =
    artwork?.width !== undefined && artwork.height !== undefined && artwork.height > artwork.width;

  if (variant === 'sidebar') {
    return (
      <section
        aria-label={`Свёрнутый просмотр: ${mediaTitle}`}
        className="watch-dock-sidebar pointer-events-auto relative isolate aspect-square w-full max-w-[calc(100dvh-38.5rem)] overflow-hidden rounded-card border border-[var(--theme-watch-dock-border)] bg-black shadow-surface ring-1 ring-inset ring-white/5 transition-[border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none"
      >
        {artwork && (
          <div className="absolute inset-x-0 top-0 h-[84%] overflow-hidden">
            <img
              src={artwork.url}
              alt=""
              width={artwork.width}
              height={artwork.height}
              decoding="async"
              className={[
                'absolute inset-0 size-full',
                isPortraitArtwork ? 'scale-110 object-cover opacity-50 blur-lg' : 'object-cover',
              ].join(' ')}
            />
            {isPortraitArtwork && (
              <img
                src={artwork.url}
                alt=""
                width={artwork.width}
                height={artwork.height}
                decoding="async"
                className="absolute inset-0 size-full object-contain"
              />
            )}
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent 26%, rgb(0 0 0 / 12%) 40%, rgb(0 0 0 / 58%) 60%, rgb(0 0 0 / 92%) 75%, #000 82%)',
          }}
        />

        <button
          type="button"
          aria-label="Закрыть просмотр"
          className="absolute top-2.5 right-2.5 z-10 inline-flex size-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/80 shadow-lg backdrop-blur-md transition-[background-color,color,transform] duration-200 hover:bg-black/80 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transform-none"
          onClick={onClose}
        >
          <CloseIcon className="size-4.5" />
        </button>

        <button
          type="button"
          aria-label={`Вернуться к просмотру: ${mediaTitle}`}
          className="absolute top-1/2 left-1/2 z-10 inline-flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-sm transition-[background-color,transform] duration-200 hover:scale-105 hover:bg-black/70 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transform-none"
          onClick={onExpand}
        >
          <PlayIcon className="size-5 translate-x-px" />
        </button>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <button
            type="button"
            className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={onExpand}
          >
            <h2 className="truncate text-sm font-bold text-white">{mediaTitle}</h2>
          </button>

          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[0.6875rem] text-white/70">
            <span className="truncate">{episodeLabel ?? 'Фильм'}</span>
            <span className="shrink-0 tabular-nums">
              {positionLabel}
              {durationLabel && ` / ${durationLabel}`}
            </span>
          </div>

          {hasKnownDuration && (
            <>
              <progress
                aria-label="Прогресс просмотра"
                value={positionSeconds}
                max={durationSeconds}
                className="sr-only"
              />
              <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-watermark transition-[width] duration-150 motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={`Свёрнутый просмотр: ${mediaTitle}`}
      className="pointer-events-auto relative isolate mx-auto grid min-h-24 w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden rounded-[1.35rem] border border-[var(--theme-watch-dock-border)] bg-black p-3 shadow-overlay sm:min-h-28 sm:gap-4 sm:p-4"
    >
      {artwork && (
        <img
          src={artwork.url}
          alt=""
          width={artwork.width}
          height={artwork.height}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/50 via-black/75 to-black/95"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/10"
      />

      <div className="relative z-10 min-w-0 self-end">
        <button
          type="button"
          className="block w-full min-w-0 text-left focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label={`Вернуться к просмотру: ${mediaTitle}`}
          onClick={onExpand}
        >
          <h2 className="block w-full truncate text-sm font-semibold text-white sm:text-base">
            {mediaTitle}
          </h2>
          <p className="mt-1 truncate text-xs text-white/65">
            {episodeLabel ?? 'Продолжить просмотр'}
          </p>
        </button>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          {hasKnownDuration && (
            <>
              <progress
                aria-label="Прогресс просмотра"
                value={positionSeconds}
                max={durationSeconds}
                className="sr-only"
              />
              <div
                aria-hidden="true"
                className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/20"
              >
                <div
                  className="h-full rounded-full bg-watermark transition-[width] duration-150 motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          )}
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-white/65">
            {positionLabel}
            {durationLabel && <span className="hidden min-[430px]:inline"> / {durationLabel}</span>}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Вернуться к просмотру"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur-sm transition-[background-color,color,transform] duration-200 hover:bg-black/75 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transform-none sm:size-11"
          onClick={onExpand}
        >
          <PlayIcon className="size-5 translate-x-px" />
        </button>

        <button
          type="button"
          aria-label="Закрыть просмотр"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/70 backdrop-blur-sm transition-[background-color,color,transform] duration-200 hover:bg-black/75 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transform-none sm:size-11"
          onClick={onClose}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
    </section>
  );
}
