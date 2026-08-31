import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import type { MediaArtwork } from '../model/media';

export type MediaBackdropArtworkProps = {
  artwork: MediaArtwork;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  transparentBackground?: boolean;
  onError?: () => void;
  onPanoramicChange?: (isPanoramic: boolean) => void;
};

type MeasuredArtwork = {
  isPanoramic: boolean;
  url: string;
};

const PANORAMIC_ASPECT_RATIO = 3;
const RETRY_DELAYS_MS = [300, 1_000, 2_500] as const;

export function MediaBackdropArtwork({
  artwork,
  className,
  imageClassName,
  loading,
  fetchPriority,
  transparentBackground = false,
  onError,
  onPanoramicChange,
}: MediaBackdropArtworkProps) {
  const [measuredArtwork, setMeasuredArtwork] = useState<MeasuredArtwork | null>(null);
  const [retryState, setRetryState] = useState({ attempt: 0, url: artwork.url });
  const retryTimerRef = useRef<number | undefined>(undefined);
  const isPanoramic = measuredArtwork?.url === artwork.url && measuredArtwork.isPanoramic;
  const retryAttempt = retryState.url === artwork.url ? retryState.attempt : 0;

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== undefined) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }

    const image = event.currentTarget;
    const aspectRatio = image.naturalWidth / image.naturalHeight;

    const nextIsPanoramic = Number.isFinite(aspectRatio) && aspectRatio >= PANORAMIC_ASPECT_RATIO;

    setMeasuredArtwork({
      isPanoramic: nextIsPanoramic,
      url: artwork.url,
    });
    onPanoramicChange?.(nextIsPanoramic);
  };

  const handleError = () => {
    if (retryAttempt >= RETRY_DELAYS_MS.length) {
      onError?.();
      return;
    }

    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = undefined;
      setRetryState({ attempt: retryAttempt + 1, url: artwork.url });
    }, RETRY_DELAYS_MS[retryAttempt]);
  };

  return (
    <div
      aria-hidden="true"
      className={[
        'isolate overflow-hidden',
        transparentBackground ? 'bg-transparent' : 'bg-black',
        className ?? 'relative size-full',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isPanoramic && (
        <img
          src={artwork.url}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover opacity-65 blur-2xl saturate-125"
        />
      )}

      <img
        key={`${artwork.url}:${retryAttempt}`}
        src={artwork.url}
        alt=""
        width={artwork.width}
        height={artwork.height}
        loading={loading}
        fetchPriority={fetchPriority}
        className={[
          'absolute inset-0 size-full',
          isPanoramic ? 'scale-[1.06] object-contain' : 'object-cover',
          imageClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
