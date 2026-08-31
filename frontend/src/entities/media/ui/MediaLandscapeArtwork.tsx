import { useState } from 'react';

import type { MediaSummary } from '../model/media';
import { MediaLandscapeFallback } from './MediaLandscapeFallback';

export type MediaLandscapeArtworkProps = {
  backdropClassName?: string;
  media: Pick<MediaSummary, 'backdrop' | 'mediaRef' | 'poster' | 'title' | 'type'>;
  variant?: 'card' | 'hero';
};

export function MediaLandscapeArtwork({
  backdropClassName,
  media,
  variant = 'card',
}: MediaLandscapeArtworkProps) {
  const [failedBackdropUrl, setFailedBackdropUrl] = useState<string | null>(null);
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const backdrop = media.backdrop;
  const poster = media.poster;
  const canShowBackdrop = backdrop !== undefined && backdrop.url !== failedBackdropUrl;
  const canShowPoster = poster !== undefined && poster.url !== failedPosterUrl;

  if (canShowBackdrop) {
    return (
      <img
        src={backdrop.url}
        alt=""
        width={backdrop.width}
        height={backdrop.height}
        className={['size-full object-cover', backdropClassName].filter(Boolean).join(' ')}
        onError={() => setFailedBackdropUrl(backdrop.url)}
      />
    );
  }

  if (canShowPoster) {
    const handlePosterError = () => setFailedPosterUrl(poster.url);

    return (
      <div aria-hidden="true" className="relative isolate size-full overflow-hidden bg-black">
        <img
          src={poster.url}
          alt=""
          width={poster.width}
          height={poster.height}
          className="absolute inset-0 size-full scale-115 object-cover opacity-80 blur-2xl saturate-125"
          onError={handlePosterError}
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
            onError={handlePosterError}
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
              onError={handlePosterError}
            />
          </div>
        )}
      </div>
    );
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
