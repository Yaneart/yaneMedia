import type { MediaSummary } from '@/entities/media';
import type { PlaybackProgress } from '@/entities/playback';
import { PlayIcon } from '@/shared';

export type ContinueWatchingCardProps = {
  media: MediaSummary;
  progress: PlaybackProgress;
  onOpen: () => void;
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

function formatRemaining(totalSeconds: number) {
  const safeMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }

  return `${safeMinutes} мин`;
}

export function ContinueWatchingCard({ media, onOpen, progress }: ContinueWatchingCardProps) {
  const durationSeconds = Math.max(0, progress.durationSeconds);
  const positionSeconds = Math.min(durationSeconds, Math.max(0, progress.positionSeconds));
  const progressMax = Math.max(1, durationSeconds);
  const progressLabel = `${formatDuration(positionSeconds)} из ${formatDuration(durationSeconds)}`;
  const remainingSeconds = Math.max(0, durationSeconds - positionSeconds);
  const resumeLabel =
    positionSeconds > 0 ? `Продолжить с ${formatDuration(positionSeconds)}` : 'Начать просмотр';
  const remainingLabel =
    remainingSeconds > 0 ? `Осталось ${formatRemaining(remainingSeconds)}` : 'Просмотрено';

  return (
    <button
      type="button"
      className={[
        'group relative block aspect-[2.35/1] w-full overflow-hidden rounded-card border border-context-border bg-elevated text-left',
        'transition-[transform,box-shadow] duration-200 ease-out',
        'active:scale-[0.992] active:duration-75',
        'motion-reduce:transform-none motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
      ].join(' ')}
      onClick={onOpen}
    >
      {media.backdrop && (
        <img
          src={media.backdrop.url}
          alt=""
          width={media.backdrop.width}
          height={media.backdrop.height}
          className={[
            'absolute inset-0 size-full object-cover transition-transform duration-300 ease-out',
            'group-hover:scale-[1.015] group-active:scale-[1.005]',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
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
          <span className="hidden min-w-0 truncate sm:block">{resumeLabel}</span>
          <span className="truncate sm:shrink-0">{remainingLabel}</span>
        </div>

        <progress
          value={positionSeconds}
          max={progressMax}
          aria-label={`Просмотрено ${progressLabel}`}
          className="mt-2 h-1.5 w-full appearance-none overflow-hidden rounded-pill bg-white/20 sm:mt-3 [&::-moz-progress-bar]:bg-white [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-white"
        />
      </div>
    </button>
  );
}
