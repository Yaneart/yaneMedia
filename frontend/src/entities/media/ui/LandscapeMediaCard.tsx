import type { MediaSummary } from '../model/media';

export type LandscapeMediaCardProps = {
  media: MediaSummary;
  onOpen: () => void;
};

export function LandscapeMediaCard({ media, onOpen }: LandscapeMediaCardProps) {
  const metadata = [media.year, media.rating?.value].filter((value) => value !== undefined);

  return (
    <button
      type="button"
      className={[
        'group relative block aspect-video w-full overflow-hidden',
        'rounded-card bg-elevated text-left',
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
            'transition-transform duration-300 group-hover:scale-[1.02]',
          ].join(' ')}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

      <div className="relative flex size-full flex-col justify-end p-3 text-white">
        <p className="truncate font-semibold">{media.title}</p>

        {metadata.length > 0 && (
          <p className="mt-1 text-caption text-white/70">{metadata.join(' · ')}</p>
        )}
      </div>
    </button>
  );
}
