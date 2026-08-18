import type {
  PlaybackArtworkSnapshot,
  PlaybackEpisodeSelection,
  PlaybackSession,
} from '@/entities/playback';
import { Button, CloseIcon, IconButton, PlayIcon } from '@/shared';
import type { CSSProperties } from 'react';
import { YaniMascot } from './YaniMascot';

export type WatchDockProps = {
  mediaTitle: string;
  artwork?: PlaybackArtworkSnapshot;
  session: PlaybackSession;
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
    .join(', ');
}

export function WatchDock({ mediaTitle, artwork, session, onExpand, onClose }: WatchDockProps) {
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

  return (
    <section
      aria-label={`Свёрнутый просмотр: ${mediaTitle}`}
      className="relative isolate flex h-16 min-w-0 items-center md:h-20"
      style={
        artwork?.accentColor
          ? ({ '--watch-dock-accent': artwork.accentColor } as CSSProperties)
          : undefined
      }
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-card border border-context-border bg-surface md:shadow-surface">
        {artwork && (
          <>
            <img
              src={artwork.url}
              alt=""
              className="absolute inset-0 hidden size-full scale-105 object-cover object-center opacity-20 blur-md saturate-75 md:block"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden bg-linear-to-r from-surface via-surface/70 to-surface/90 md:block"
            />
          </>
        )}

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
              className="absolute inset-y-0 left-0 bg-watch-progress transition-colors duration-150 motion-reduce:transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </>
        )}
      </div>

      {artwork && (
        <img
          src={artwork.url}
          alt=""
          width={artwork.width}
          height={artwork.height}
          className="relative z-10 h-full w-16 shrink-0 rounded-l-card object-cover md:w-32"
        />
      )}

      <div className="relative z-10 min-w-0 flex-1 px-2 md:px-5 xl:w-[24%] xl:flex-none">
        <h2 className="truncate font-semibold text-text-primary">{mediaTitle}</h2>

        <p className="mt-1 truncate text-caption text-text-secondary">
          {episodeLabel && `${episodeLabel} · `}
          {positionLabel}
          {durationLabel && ` из ${durationLabel}`}
        </p>
      </div>

      <div className="hidden min-w-0 flex-1 xl:block" />

      <div className="relative z-10 flex shrink-0 items-center gap-1 pr-2 md:gap-2 md:pr-3">
        <div className="relative shrink-0">
          <YaniMascot />

          <Button
            size="small"
            variant="secondary"
            aria-label="Продолжить просмотр"
            className="shrink-0 whitespace-nowrap max-[359px]:size-9 max-[359px]:px-0"
            onClick={onExpand}
          >
            <PlayIcon className="hidden size-5 max-[359px]:block" />
            <span className="max-[359px]:hidden sm:hidden">Продолжить</span>
            <span className="hidden sm:inline">Продолжить просмотр</span>
          </Button>
        </div>

        <IconButton size="medium" variant="ghost" aria-label="Закрыть просмотр" onClick={onClose}>
          <CloseIcon className="size-5" />
        </IconButton>
      </div>
    </section>
  );
}
