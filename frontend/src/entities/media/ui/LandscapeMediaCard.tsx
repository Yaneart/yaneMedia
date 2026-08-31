import type { MediaSummary } from '../model/media';
import { MediaLandscapeFallback } from './MediaLandscapeFallback';
import { useState } from 'react';

export type LandscapeMediaCardProps = {
  media: MediaSummary;
  onOpen: () => void;
};

const mediaTypeLabels = {
  movie: 'Фильм',
  series: 'Сериал',
  anime: 'Аниме',
} satisfies Record<MediaSummary['type'], string>;

export function LandscapeMediaCard({ media, onOpen }: LandscapeMediaCardProps) {
  const [failedBackdropUrl, setFailedBackdropUrl] = useState<string | null>(null);
  const metadata = [mediaTypeLabels[media.type], media.year, media.rating?.value].filter(
    (value) => value !== undefined,
  );
  const fallbackMetadata = [media.year, media.rating?.value].filter((value) => value !== undefined);
  const backdrop = media.backdrop;
  const canShowBackdrop = backdrop !== undefined && backdrop.url !== failedBackdropUrl;

  return (
    <button
      type="button"
      aria-label={`Открыть ${media.title}`}
      className={[
        'group relative block aspect-video w-full overflow-hidden',
        'rounded-card border border-context-border bg-elevated text-left',
        'transition-[transform,box-shadow] duration-200 ease-out',
        'active:scale-[0.992] active:duration-75',
        'motion-reduce:transform-none motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
      ].join(' ')}
      onClick={onOpen}
    >
      {canShowBackdrop ? (
        <img
          src={backdrop.url}
          alt=""
          width={backdrop.width}
          height={backdrop.height}
          className={[
            'absolute inset-0 size-full object-cover',
            'transition-transform duration-300 ease-out',
            'group-hover:scale-[1.015] group-active:scale-[1.005]',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
          onError={() => setFailedBackdropUrl(backdrop.url)}
        />
      ) : (
        <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none">
          <MediaLandscapeFallback mediaRef={media.mediaRef} title={media.title} type={media.type} />
        </div>
      )}

      <div
        className={[
          'absolute inset-0 bg-linear-to-t to-transparent',
          canShowBackdrop ? 'from-black/95 via-black/20' : 'from-black/45 via-transparent',
        ].join(' ')}
      />

      <div
        className={[
          'relative flex size-full flex-col justify-end p-4 text-white',
          canShowBackdrop ? '' : 'items-end text-right',
        ].join(' ')}
      >
        {canShowBackdrop && (
          <p className="line-clamp-2 font-semibold leading-tight">{media.title}</p>
        )}

        {(canShowBackdrop ? metadata : fallbackMetadata).length > 0 && (
          <p className="mt-1.5 text-caption text-white/60">
            {(canShowBackdrop ? metadata : fallbackMetadata).join(' · ')}
          </p>
        )}
      </div>
    </button>
  );
}
