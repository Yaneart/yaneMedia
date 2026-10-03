import type { MediaSourceOption } from '@/entities/media-source';
import {
  FullscreenExitIcon,
  FullscreenIcon,
  IconButton,
  PauseIcon,
  PlayIcon,
  Select,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMuteIcon,
  type SelectOption,
} from '@/shared';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export type MediaVideoDirectControls = {
  tracks: readonly SelectOption[];
  selectedTrackKey: string | null;
  onTrackChange: (trackKey: string) => void;
  qualities: readonly SelectOption[];
  selectedQualityKey: string | null;
  onQualityChange: (qualityKey: string) => void;
  onNextEpisode?: () => void;
};

type MediaVideoRendererProps = {
  source: MediaSourceOption;
  mediaTitle: string;
  shouldAutoPlay: boolean;
  initialPositionSeconds: number;
  directControls?: MediaVideoDirectControls;
  onReady: () => void;
  onError: () => void;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (
    positionSeconds: number,
    durationSeconds: number | undefined,
    reason: 'periodic' | 'metadata' | 'seek' | 'pause' | 'ended',
  ) => void;
};

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';
const PROGRESS_REPORT_INTERVAL_SECONDS = 5;

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MediaVideoRenderer({
  source,
  mediaTitle,
  shouldAutoPlay,
  initialPositionSeconds,
  directControls,
  onReady,
  onError,
  onPlay,
  onPause,
  onProgress,
}: MediaVideoRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceUrlRef = useRef(source.url);
  const hasRestoredPositionRef = useRef(false);
  const lastReportedProgressBucketRef = useRef<number | null>(null);
  const suppressPauseRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  sourceUrlRef.current = source.url;

  const reportProgress = (
    video: HTMLVideoElement,
    reason: 'periodic' | 'metadata' | 'seek' | 'pause' | 'ended' = 'periodic',
    force = false,
  ) => {
    const positionSeconds = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    const durationSeconds =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const progressBucket = Math.floor(positionSeconds / PROGRESS_REPORT_INTERVAL_SECONDS);

    setPositionSeconds(positionSeconds);
    setDurationSeconds(durationSeconds ?? 0);

    if (!force && progressBucket === lastReportedProgressBucketRef.current) {
      return;
    }

    lastReportedProgressBucketRef.current = progressBucket;
    onProgress(positionSeconds, durationSeconds, reason);
  };

  const restoreInitialPosition = (video: HTMLVideoElement) => {
    if (hasRestoredPositionRef.current) {
      return;
    }

    if (initialPositionSeconds <= 0) {
      hasRestoredPositionRef.current = true;
      return;
    }

    const durationSeconds =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;

    try {
      video.currentTime =
        durationSeconds === null
          ? initialPositionSeconds
          : Math.min(initialPositionSeconds, durationSeconds);
      hasRestoredPositionRef.current = true;
    } catch {
      // Некоторые потоки разрешают seek только после появления первого доступного диапазона.
    }
  };

  const handleLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;

    restoreInitialPosition(video);
    reportProgress(video, 'metadata', true);
  };

  const handleCanPlay = (event: SyntheticEvent<HTMLVideoElement>) => {
    restoreInitialPosition(event.currentTarget);
    onReady();
  };

  const togglePlayback = () => {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;

    if (!container) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    hasRestoredPositionRef.current = false;
    lastReportedProgressBucketRef.current = null;
    suppressPauseRef.current = false;
    const sourceUrl = sourceUrlRef.current;

    if (source.kind === 'mp4') {
      video.src = sourceUrl;
      video.load();

      return () => {
        suppressPauseRef.current = true;
        video.removeAttribute('src');
        video.load();
      };
    }

    if (source.kind !== 'hls') {
      return;
    }

    let isDisposed = false;
    let destroyHls: (() => void) | undefined;

    const loadHls = async () => {
      try {
        const { default: Hls } = await import('hls.js');

        if (isDisposed) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls();

          destroyHls = () => hls.destroy();

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              onError();
            }
          });
          hls.loadSource(sourceUrl);
          hls.attachMedia(video);

          return;
        }

        if (video.canPlayType(HLS_MIME_TYPE)) {
          video.src = sourceUrl;
          video.load();

          return;
        }

        onError();
      } catch {
        if (!isDisposed) {
          onError();
        }
      }
    };

    void loadHls();

    return () => {
      isDisposed = true;
      destroyHls?.();
      suppressPauseRef.current = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [onError, source.kind, source.sourceRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 size-full bg-black">
      <video
        ref={videoRef}
        title={`Плеер ${source.label}: ${mediaTitle}`}
        className="size-full bg-black object-contain"
        autoPlay={shouldAutoPlay}
        playsInline
        preload="metadata"
        onClick={togglePlayback}
        onDoubleClick={() => void toggleFullscreen()}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDurationSeconds(Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 0);
        }}
        onTimeUpdate={(event) => reportProgress(event.currentTarget)}
        onSeeked={(event) => reportProgress(event.currentTarget, 'seek', true)}
        onPlay={() => {
          setIsPlaying(true);
          onPlay();
        }}
        onPause={(event) => {
          setIsPlaying(false);
          if (suppressPauseRef.current) return;
          reportProgress(event.currentTarget, 'pause', true);
          onPause();
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          reportProgress(event.currentTarget, 'ended', true);
        }}
        onCanPlay={handleCanPlay}
        onError={onError}
      />

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-3 pb-3 pt-10 text-white sm:px-4">
        <input
          type="range"
          aria-label="Позиция воспроизведения"
          min={0}
          max={durationSeconds || 0}
          step={0.1}
          value={Math.min(positionSeconds, durationSeconds || 0)}
          className="h-1 w-full cursor-pointer accent-action"
          onChange={(event) => {
            const video = videoRef.current;
            const nextPosition = Number(event.currentTarget.value);

            if (!video || !Number.isFinite(nextPosition)) return;
            video.currentTime = nextPosition;
            setPositionSeconds(nextPosition);
          }}
        />

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <IconButton
            size="small"
            variant="bare"
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            className="text-white hover:bg-white/10"
            onClick={togglePlayback}
          >
            {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
          </IconButton>

          <span className="shrink-0 text-xs tabular-nums text-white/80">
            {formatPlaybackTime(positionSeconds)} / {formatPlaybackTime(durationSeconds)}
          </span>

          <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 sm:flex">
            {directControls && directControls.tracks.length > 1 && (
              <Select
                aria-label="Озвучка"
                value={directControls.selectedTrackKey}
                options={directControls.tracks}
                placeholder="Озвучка"
                allowEmpty={false}
                matchMenuWidth
                menuPlacement="top"
                className="w-44 [&>button]:min-h-9 [&>button]:border-white/15 [&>button]:bg-black/55 [&>button]:text-xs"
                onChange={(value) => {
                  if (value !== null) directControls.onTrackChange(value);
                }}
              />
            )}

            {directControls && directControls.qualities.length > 1 && (
              <Select
                aria-label="Качество"
                value={directControls.selectedQualityKey}
                options={directControls.qualities}
                placeholder="Качество"
                allowEmpty={false}
                matchMenuWidth
                menuPlacement="top"
                className="w-32 [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:border-white/15 [&>button]:bg-black/55 [&>button]:text-xs"
                onChange={(value) => {
                  if (value !== null) directControls.onQualityChange(value);
                }}
              />
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
            {directControls?.onNextEpisode && (
              <IconButton
                size="small"
                variant="bare"
                aria-label="Следующая серия"
                title="Следующая серия"
                className="text-white hover:bg-white/10"
                onClick={directControls.onNextEpisode}
              >
                <SkipForwardIcon className="size-5" />
              </IconButton>
            )}

            <IconButton
              size="small"
              variant="bare"
              aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
              className="text-white hover:bg-white/10"
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? (
                <VolumeMuteIcon className="size-5" />
              ) : (
                <VolumeIcon className="size-5" />
              )}
            </IconButton>

            <input
              type="range"
              aria-label="Громкость"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              className="hidden h-1 w-20 cursor-pointer accent-action md:block"
              onChange={(event) => {
                const video = videoRef.current;
                const nextVolume = Number(event.currentTarget.value);

                if (!video || !Number.isFinite(nextVolume)) return;
                video.volume = nextVolume;
                video.muted = nextVolume === 0;
                setVolume(nextVolume);
                setIsMuted(video.muted);
              }}
            />

            <IconButton
              size="small"
              variant="bare"
              aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
              className="text-white hover:bg-white/10"
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? (
                <FullscreenExitIcon className="size-5" />
              ) : (
                <FullscreenIcon className="size-5" />
              )}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
