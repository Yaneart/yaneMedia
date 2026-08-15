import type { MediaSummary } from '../model/media';

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
  const metadata = [mediaTypeLabels[media.type], media.year, media.rating?.value].filter(
    (value) => value !== undefined,
  );

  return (
    <button
      type="button"
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
      {media.backdrop && (
        <img
          src={media.backdrop.url}
          alt=""
          width={media.backdrop.width}
          height={media.backdrop.height}
          className={[
            'absolute inset-0 size-full object-cover',
            'transition-transform duration-300 ease-out',
            'group-hover:scale-[1.015] group-active:scale-[1.005]',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />

      <div className="relative flex size-full flex-col justify-end p-4 text-white">
        <p className="line-clamp-2 font-semibold leading-tight">{media.title}</p>

        {metadata.length > 0 && (
          <p className="mt-1.5 text-caption text-white/60">{metadata.join(' · ')}</p>
        )}
      </div>
    </button>
  );
}
