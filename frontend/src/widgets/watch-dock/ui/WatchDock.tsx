import type {
  PlaybackArtworkSnapshot,
  PlaybackEpisodeSelection,
  PlaybackSession,
} from '@/entities/playback';
import {
  CloseIcon,
  ExpandPlayerIcon,
  IconButton,
  PauseIcon,
  PlayIcon,
  RewindBackward10Icon,
  RewindForward10Icon,
  VolumeIcon,
  VolumeMuteIcon,
} from '@/shared';
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

export type WatchDockProps = {
  mediaTitle: string;
  artwork?: PlaybackArtworkSnapshot;
  session: PlaybackSession;
  onPause: () => void;
  onResume: () => void;
  onSeek: (positionSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
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

const desktopProgressInsetPixels = 24;

export function WatchDock({
  mediaTitle,
  artwork,
  session,
  onPause,
  onResume,
  onSeek,
  onVolumeChange,
  onExpand,
  onClose,
}: WatchDockProps) {
  const progressId = useId();
  const volumeId = useId();
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null);
  const isPointerSeeking = useRef(false);
  const lastAudibleVolume = useRef(session.volume > 0 ? session.volume : 1);
  const isPlaying = session.state === 'playing';
  const isMuted = session.volume <= 0;
  const volumePercent = Math.round(session.volume * 100);
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
  const durationLabel = durationSeconds === null ? null : formatPlaybackTime(durationSeconds);

  const progressMax = hasKnownDuration ? durationSeconds : 1;
  const progressValue = hasKnownDuration ? positionSeconds : 0;
  const progressRatio = hasKnownDuration ? progressValue / progressMax : 0;
  const progressPercent = progressRatio * 100;
  const desktopProgressOffset = desktopProgressInsetPixels * (1 - progressRatio * 2);
  const desktopProgressWidth = `calc(${progressPercent}% + ${desktopProgressOffset}px)`;
  const tooltipSeconds = previewSeconds ?? progressValue;
  const tooltipPosition = hasKnownDuration ? (tooltipSeconds / durationSeconds) * 100 : 0;

  useEffect(() => {
    if (session.volume > 0) {
      lastAudibleVolume.current = session.volume;
    }
  }, [session.volume]);

  const seekTo = (nextPositionSeconds: number) => {
    const normalizedPosition = Math.max(
      0,
      hasKnownDuration ? Math.min(nextPositionSeconds, durationSeconds) : nextPositionSeconds,
    );

    onSeek(normalizedPosition);
  };

  const getPointerSeconds = (event: PointerEvent<HTMLInputElement>) => {
    if (!hasKnownDuration) return null;

    const bounds = event.currentTarget.getBoundingClientRect();
    const trackWidth = Math.max(1, bounds.width - desktopProgressInsetPixels * 2);
    const pointerRatio = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left - desktopProgressInsetPixels) / trackWidth),
    );

    return pointerRatio * durationSeconds;
  };

  const updatePreview = (event: PointerEvent<HTMLInputElement>) => {
    const nextPreviewSeconds = getPointerSeconds(event);

    if (nextPreviewSeconds !== null) {
      setPreviewSeconds(nextPreviewSeconds);
    }

    return nextPreviewSeconds;
  };

  return (
    <section
      aria-label={`Текущий просмотр: ${mediaTitle}`}
      className="relative isolate flex h-16 min-w-0 items-center md:h-24"
      style={
        artwork?.accentColor
          ? ({ '--watch-dock-accent': artwork.accentColor } as CSSProperties)
          : undefined
      }
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-card border border-context-border bg-surface md:shadow-surface">
        {hasKnownDuration && (
          <>
            <progress
              aria-label="Прогресс просмотра"
              value={progressValue}
              max={progressMax}
              className="sr-only"
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-watch-progress transition-colors duration-150 motion-reduce:transition-none md:hidden"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 hidden bg-watch-progress transition-colors duration-150 motion-reduce:transition-none md:block"
              style={{ width: desktopProgressWidth }}
            />
          </>
        )}
      </div>

      {hasKnownDuration && (
        <>
          <label htmlFor={progressId} className="sr-only">
            Позиция воспроизведения
          </label>
          <input
            id={progressId}
            type="range"
            min={0}
            max={progressMax}
            step={1}
            value={progressValue}
            aria-valuetext={`${positionLabel} из ${durationLabel}`}
            className="peer absolute inset-x-0 top-0 z-40 hidden h-6 w-full touch-none cursor-pointer appearance-none bg-transparent opacity-0 focus:outline-none md:block"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              isPointerSeeking.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              const nextPositionSeconds = updatePreview(event);

              if (nextPositionSeconds !== null) {
                seekTo(nextPositionSeconds);
              }
            }}
            onPointerMove={(event) => {
              const nextPositionSeconds = updatePreview(event);

              if (
                nextPositionSeconds !== null &&
                event.currentTarget.hasPointerCapture(event.pointerId)
              ) {
                seekTo(nextPositionSeconds);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }

              isPointerSeeking.current = false;
            }}
            onPointerCancel={() => {
              isPointerSeeking.current = false;
              setPreviewSeconds(null);
            }}
            onLostPointerCapture={() => {
              isPointerSeeking.current = false;
            }}
            onPointerLeave={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                setPreviewSeconds(null);
              }
            }}
            onFocus={() => setPreviewSeconds(progressValue)}
            onBlur={() => setPreviewSeconds(null)}
            onChange={(event) => {
              if (isPointerSeeking.current) return;

              const nextPositionSeconds = Number(event.currentTarget.value);
              setPreviewSeconds(nextPositionSeconds);
              seekTo(nextPositionSeconds);
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-0 z-30 hidden h-0.5 overflow-hidden bg-text-secondary/35 opacity-0 transition-opacity duration-150 peer-hover:opacity-100 peer-focus:opacity-100 motion-reduce:transition-none md:block"
          >
            <div
              className="h-full bg-watch-progress-line"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-0 z-40 hidden h-0.5 md:block"
          >
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-watch-progress-line shadow-sm ring-1 ring-surface"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 -top-10 z-50 hidden h-7 opacity-0 transition-opacity duration-150 peer-hover:opacity-100 peer-focus:opacity-100 motion-reduce:transition-none md:block"
          >
            <span
              className="absolute -translate-x-1/2 rounded-control bg-popover px-2.5 py-1 text-caption text-text-primary shadow-overlay"
              style={{ left: `${tooltipPosition}%` }}
            >
              {formatPlaybackTime(tooltipSeconds)}
            </span>
          </div>
        </>
      )}

      {artwork && (
        <img
          src={artwork.url}
          alt=""
          width={artwork.width}
          height={artwork.height}
          className="relative z-10 h-full w-16 shrink-0 rounded-l-card object-cover md:w-40"
        />
      )}

      <div className="relative z-10 min-w-0 flex-1 px-2 md:px-5">
        <h2 className="truncate font-semibold text-text-primary">{mediaTitle}</h2>

        <p className="mt-1 truncate text-caption text-text-secondary">
          {episodeLabel && `${episodeLabel} · `}
          {positionLabel}
          {durationLabel && ` из ${durationLabel}`}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1 pr-2 md:gap-2 md:pr-3">
        <IconButton
          size="medium"
          variant="ghost"
          aria-label="Перемотать назад на 10 секунд"
          className="hidden! lg:inline-flex!"
          disabled={positionSeconds <= 0}
          onClick={() => seekTo(positionSeconds - 10)}
        >
          <RewindBackward10Icon className="size-5" />
        </IconButton>

        <IconButton
          size="medium"
          variant="ghost"
          aria-label={isPlaying ? 'Поставить на паузу' : 'Продолжить воспроизведение'}
          className="rounded-full bg-text-primary! text-surface! hover:opacity-90"
          onClick={isPlaying ? onPause : onResume}
        >
          {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
        </IconButton>

        <IconButton
          size="medium"
          variant="ghost"
          aria-label="Перемотать вперёд на 10 секунд"
          className="hidden! lg:inline-flex!"
          disabled={hasKnownDuration && positionSeconds >= durationSeconds}
          onClick={() => seekTo(positionSeconds + 10)}
        >
          <RewindForward10Icon className="size-5" />
        </IconButton>

        <div className="relative z-10 hidden items-center gap-2 md:flex">
          <IconButton
            size="medium"
            variant="ghost"
            aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
            aria-pressed={isMuted}
            onClick={() => onVolumeChange(isMuted ? lastAudibleVolume.current : 0)}
          >
            {isMuted ? <VolumeMuteIcon className="size-5" /> : <VolumeIcon className="size-5" />}
          </IconButton>

          <label htmlFor={volumeId} className="sr-only">
            Громкость
          </label>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            aria-valuetext={`${volumePercent}%`}
            title={`Громкость: ${volumePercent}%`}
            className={[
              'h-1 w-14 cursor-pointer appearance-none rounded-pill bg-text-secondary/35 lg:w-16 xl:w-20',
              '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:shadow-sm',
              '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-text-primary [&::-moz-range-thumb]:shadow-sm',
            ].join(' ')}
            onChange={(event) => onVolumeChange(Number(event.currentTarget.value) / 100)}
          />
          <output
            htmlFor={volumeId}
            className="hidden w-9 text-right text-caption tabular-nums text-text-secondary 2xl:block"
          >
            {volumePercent}%
          </output>
        </div>

        <IconButton size="medium" variant="ghost" aria-label="Развернуть плеер" onClick={onExpand}>
          <ExpandPlayerIcon className="size-5" />
        </IconButton>

        <IconButton
          size="medium"
          variant="ghost"
          aria-label="Закрыть просмотр"
          className="hidden! lg:inline-flex!"
          onClick={onClose}
        >
          <CloseIcon className="size-5" />
        </IconButton>
      </div>
    </section>
  );
}
