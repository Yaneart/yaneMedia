import type { MediaSummary } from '@/entities/media';
import type { PlaybackProgress } from '@/entities/playback';

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

export function ContinueWatchingCard({ media, onOpen, progress }: ContinueWatchingCardProps) {
  const durationSeconds = Math.max(0, progress.durationSeconds);
  const positionSeconds = Math.min(durationSeconds, Math.max(0, progress.positionSeconds));
  const progressMax = Math.max(1, durationSeconds);
  const progressLabel = `${formatDuration(positionSeconds)} из ${formatDuration(durationSeconds)}`;

  return (
    <button
      type="button"
      className="group relative block aspect-video w-full overflow-hidden rounded-card bg-elevated text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      onClick={onOpen}
    >
      {media.backdrop && (
        <img
          src={media.backdrop.url}
          alt=""
          width={media.backdrop.width}
          height={media.backdrop.height}
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      <div className="relative flex size-full flex-col justify-end p-3 text-white">
        <div className="flex items-end justify-between gap-3">
          <h3 className="min-w-0 truncate font-semibold">{media.title}</h3>

          <span className="shrink-0 text-sm text-white/70">{progressLabel}</span>
        </div>

        <progress
          value={positionSeconds}
          max={progressMax}
          aria-label={`Просмотрено ${progressLabel}`}
          className="mt-3 h-1 w-full appearance-none overflow-hidden rounded-pill bg-white/30 [&::-moz-progress-bar]:bg-white [&::-webkit-progress-bar]:bg-white/30 [&::-webkit-progress-value]:bg-white"
        />
      </div>
    </button>
  );
}
