import { useEffect, useRef, useState } from 'react';

import type { MediaArtwork, MediaSummary } from '../model/media';
import { MediaBackdropArtwork } from './MediaBackdropArtwork';
import { MediaLandscapeFallback } from './MediaLandscapeFallback';

export type MediaLandscapeArtworkProps = {
  backdropClassName?: string;
  media: Pick<MediaSummary, 'backdrop' | 'mediaRef' | 'poster' | 'title' | 'type'>;
  variant?: 'card' | 'hero';
};

const FAILED_BACKDROP_RETRY_DELAY_MS = 30_000;

type PosterCompositionProps = {
  onError: () => void;
  poster: MediaArtwork;
  variant: 'card' | 'hero';
};

function PosterComposition({ onError, poster, variant }: PosterCompositionProps) {
  return (
    <div aria-hidden="true" className="relative isolate size-full overflow-hidden bg-black">
      <img
        src={poster.url}
        alt=""
        width={poster.width}
        height={poster.height}
        className="absolute inset-0 size-full scale-115 object-cover opacity-80 blur-2xl saturate-125"
        onError={onError}
      />

      <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/25 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-white/10" />

      {variant === 'hero' ? (
        <img
          src={poster.url}
          alt=""
          width={poster.width}
          height={poster.height}
          className="absolute inset-y-[-8%] right-[5%] h-[116%] w-[52%] object-contain drop-shadow-[0_16px_30px_rgb(0_0_0/0.5)] md:right-[8%] md:w-[46%]"
          onError={onError}
        />
      ) : (
        <div
          className="absolute inset-y-0 right-0 w-[70%]"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 28%)',
            maskImage: 'linear-gradient(to right, transparent 0%, black 28%)',
          }}
        >
          <img
            src={poster.url}
            alt=""
            width={poster.width}
            height={poster.height}
            className="size-full object-cover object-center saturate-110"
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}

export function MediaLandscapeArtwork({
  backdropClassName,
  media,
  variant = 'card',
}: MediaLandscapeArtworkProps) {
  const [failedBackdropUrl, setFailedBackdropUrl] = useState<string | null>(null);
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const [panoramicBackdropUrl, setPanoramicBackdropUrl] = useState<string | null>(null);
  const backdropRetryTimerRef = useRef<number | undefined>(undefined);
  const backdrop = media.backdrop;
  const poster = media.poster;
  const canShowBackdrop = backdrop !== undefined && backdrop.url !== failedBackdropUrl;
  const canShowPoster = poster !== undefined && poster.url !== failedPosterUrl;
  const shouldUsePosterComposition =
    variant === 'card' && panoramicBackdropUrl === backdrop?.url && canShowPoster;

  useEffect(() => {
    return () => {
      if (backdropRetryTimerRef.current !== undefined) {
        window.clearTimeout(backdropRetryTimerRef.current);
      }
    };
  }, []);

  const handleBackdropError = () => {
    if (!backdrop) {
      return;
    }

    const failedUrl = backdrop.url;

    setFailedBackdropUrl(failedUrl);
    backdropRetryTimerRef.current = window.setTimeout(() => {
      backdropRetryTimerRef.current = undefined;
      setFailedBackdropUrl((currentUrl) => (currentUrl === failedUrl ? null : currentUrl));
    }, FAILED_BACKDROP_RETRY_DELAY_MS);
  };

  const handlePosterError = () => {
    if (poster) {
      setFailedPosterUrl(poster.url);
    }
  };

  if (canShowBackdrop && !shouldUsePosterComposition) {
    return (
      <div className="relative size-full overflow-hidden bg-black">
        {canShowPoster && (
          <PosterComposition poster={poster} variant={variant} onError={handlePosterError} />
        )}

        <MediaBackdropArtwork
          artwork={backdrop}
          className="absolute inset-0 size-full"
          imageClassName={backdropClassName}
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          fetchPriority={variant === 'hero' ? 'high' : 'auto'}
          transparentBackground={canShowPoster}
          onError={handleBackdropError}
          onPanoramicChange={(isPanoramic) =>
            setPanoramicBackdropUrl(isPanoramic ? backdrop.url : null)
          }
        />
      </div>
    );
  }

  if (canShowPoster) {
    return <PosterComposition poster={poster} variant={variant} onError={handlePosterError} />;
  }

  return (
    <MediaLandscapeFallback
      mediaRef={media.mediaRef}
      title={media.title}
      type={media.type}
      showTitle={false}
      showType={false}
    />
  );
}
