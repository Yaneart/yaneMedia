import type { MediaSourceOption } from '@/entities/media-source';
import { useEffect, useRef, type SyntheticEvent } from 'react';

type MediaVideoRendererProps = {
  source: MediaSourceOption;
  mediaTitle: string;
  initialPositionSeconds: number;
  onReady: () => void;
  onError: () => void;
  onProgress: (positionSeconds: number, durationSeconds?: number | null) => void;
};

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';
const PROGRESS_REPORT_INTERVAL_SECONDS = 5;

export function MediaVideoRenderer({
  source,
  mediaTitle,
  initialPositionSeconds,
  onReady,
  onError,
  onProgress,
}: MediaVideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasRestoredPositionRef = useRef(false);
  const lastReportedProgressBucketRef = useRef<number | null>(null);

  const reportProgress = (video: HTMLVideoElement, force = false) => {
    const positionSeconds = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    const durationSeconds =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const progressBucket = Math.floor(positionSeconds / PROGRESS_REPORT_INTERVAL_SECONDS);

    if (!force && progressBucket === lastReportedProgressBucketRef.current) {
      return;
    }

    lastReportedProgressBucketRef.current = progressBucket;
    onProgress(positionSeconds, durationSeconds);
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
    reportProgress(video, true);
  };

  const handleCanPlay = (event: SyntheticEvent<HTMLVideoElement>) => {
    restoreInitialPosition(event.currentTarget);
    onReady();
  };

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    hasRestoredPositionRef.current = false;
    lastReportedProgressBucketRef.current = null;

    if (source.kind === 'mp4') {
      video.src = source.url;
      video.load();

      return () => {
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
          hls.loadSource(source.url);
          hls.attachMedia(video);

          return;
        }

        if (video.canPlayType(HLS_MIME_TYPE)) {
          video.src = source.url;
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
      video.removeAttribute('src');
      video.load();
    };
  }, [onError, source.kind, source.url]);

  return (
    <video
      ref={videoRef}
      title={`Плеер ${source.label}: ${mediaTitle}`}
      className="absolute inset-0 z-0 size-full bg-black object-contain"
      controls
      autoPlay
      playsInline
      preload="metadata"
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={(event) => reportProgress(event.currentTarget)}
      onSeeked={(event) => reportProgress(event.currentTarget, true)}
      onPause={(event) => reportProgress(event.currentTarget, true)}
      onEnded={(event) => reportProgress(event.currentTarget, true)}
      onCanPlay={handleCanPlay}
      onError={onError}
    />
  );
}
