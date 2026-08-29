import type { MediaSourceOption } from '@/entities/media-source';
import { useEffect, useRef } from 'react';

type MediaVideoRendererProps = {
  source: MediaSourceOption;
  mediaTitle: string;
  onReady: () => void;
  onError: () => void;
};

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';

export function MediaVideoRenderer({
  source,
  mediaTitle,
  onReady,
  onError,
}: MediaVideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

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
      onCanPlay={onReady}
      onError={onError}
    />
  );
}
