import { MediaLandscapeArtwork, MediaLink, type MediaSummary } from '@/entities/media';
import type { PlaybackEpisodeSelection, PlaybackProgress } from '@/entities/playback';
import { CloseIcon, IconButton, PlayIcon } from '@/shared';
import type { MouseEvent } from 'react';

export type ContinueWatchingCardProps = {
  media: MediaSummary;
  progress: PlaybackProgress;
  episode?: PlaybackEpisodeSelection | null;
  onContinue: () => void;
  onRemove: () => void;
};

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatEpisode(episode: PlaybackEpisodeSelection | null | undefined) {
  if (!episode) {
    return null;
  }

  const episodeNumber = episode.absoluteEpisodeNumber ?? episode.episodeNumber;

  return episode.seasonNumber === undefined
    ? `Серия ${episodeNumber}`
    : `Сезон ${episode.seasonNumber} · серия ${episodeNumber}`;
}

export function ContinueWatchingCard({
  media,
  onContinue,
  onRemove,
  progress,
  episode,
}: ContinueWatchingCardProps) {
  const durationSeconds =
    progress.durationSeconds !== null &&
    Number.isFinite(progress.durationSeconds) &&
    progress.durationSeconds > 0
      ? progress.durationSeconds
      : null;
  const rawPositionSeconds = Number.isFinite(progress.positionSeconds)
    ? Math.max(0, progress.positionSeconds)
    : 0;
  const positionSeconds =
    durationSeconds === null ? rawPositionSeconds : Math.min(durationSeconds, rawPositionSeconds);
  const episodeLabel = formatEpisode(episode);
  const progressLabel =
    durationSeconds === null
      ? 'Точный прогресс недоступен'
      : `${formatDuration(positionSeconds)} из ${formatDuration(durationSeconds)}`;

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, action: () => void) => {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      action();
    }
  };

  return (
    <article className="relative min-w-0">
      <MediaLink
        mediaRef={media.mediaRef}
        aria-label={`Продолжить просмотр: ${media.title}`}
        className={[
          'group relative block aspect-[2.35/1] w-full overflow-hidden rounded-card border border-context-border bg-elevated text-left',
          'transition-[transform,box-shadow] duration-200 ease-out',
          'active:scale-[0.992] active:duration-75',
          'motion-reduce:transform-none motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
        ].join(' ')}
        onClick={(event) => handleLinkClick(event, onContinue)}
      >
        <div
          className={[
            'absolute inset-0 transition-transform duration-300 ease-out',
            'group-hover:scale-[1.015] group-active:scale-[1.005]',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
        >
          <MediaLandscapeArtwork media={media} />
        </div>

        <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/25 to-transparent" />
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 ease-out group-hover:bg-black/10 motion-reduce:transition-none" />

        <span
          aria-hidden="true"
          className={[
            'absolute left-1/2 top-1/2 z-10 flex size-12 -translate-x-1/2 -translate-y-1/2',
            'scale-95 items-center justify-center rounded-full bg-black/55 text-white',
            'opacity-0 shadow-overlay backdrop-blur-sm',
            'transition-[opacity,transform] duration-200 ease-out',
            'group-hover:scale-100 group-hover:opacity-100',
            'group-focus-visible:scale-100 group-focus-visible:opacity-100',
            'motion-reduce:transition-none',
          ].join(' ')}
        >
          <PlayIcon className="size-5 translate-x-px" />
        </span>

        <div className="relative flex size-full flex-col justify-end p-3 text-white sm:p-4">
          <h3 className="truncate font-semibold leading-tight">{media.title}</h3>

          <div className="mt-1.5 flex items-center justify-between gap-3 text-caption text-white/65">
            {episodeLabel && (
              <span className="hidden min-w-0 truncate sm:block">{episodeLabel}</span>
            )}
            <span className="truncate sm:ml-auto sm:shrink-0">{progressLabel}</span>
          </div>

          {durationSeconds !== null && (
            <progress
              value={positionSeconds}
              max={durationSeconds}
              aria-label={`Просмотрено ${formatDuration(positionSeconds)} из ${formatDuration(durationSeconds)}`}
              className="mt-2 h-1.5 w-full appearance-none overflow-hidden rounded-pill bg-white/20 sm:mt-3 [&::-moz-progress-bar]:bg-white [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-white"
            />
          )}
        </div>
      </MediaLink>

      <div className="absolute top-2 right-2 z-20">
        <IconButton
          size="custom"
          variant="bare"
          className="size-9 rounded-full border border-white/20 bg-black/65 text-white shadow-overlay backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:ring-white/70"
          aria-label={`Убрать «${media.title}» из продолжения просмотра`}
          title="Убрать из списка"
          onClick={onRemove}
        >
          <CloseIcon aria-hidden="true" className="size-5" />
        </IconButton>
      </div>
    </article>
  );
}
