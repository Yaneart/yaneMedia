import type { MediaSummary } from '../model/media';

export type MediaCardProps = {
  media: MediaSummary;
  onOpen: () => void;
};

export function MediaCard({ media, onOpen }: MediaCardProps) {
  const metadata = [media.year, media.rating?.value].filter((value) => value !== undefined);

  return (
    <button type="button" className="group block min-w-0 text-left" onClick={onOpen}>
      <div className="aspect-2/3 overflow-hidden rounded-card bg-elevated">
        {media.poster && (
          <img
            src={media.poster.url}
            alt=""
            width={media.poster.width}
            height={media.poster.height}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
      </div>

      <p className="mt-2 truncate font-semibold text-text-primary">{media.title}</p>

      {metadata.length > 0 && (
        <p className="mt-1 text-caption text-text-secondary">{metadata.join(' · ')}</p>
      )}
    </button>
  );
}
