import { FavoriteIcon, IconButton } from '@/shared';
import type { MediaSummary } from '../model/media';

export type MediaCardProps = {
  media: MediaSummary;
  isFavorite: boolean;
  onOpen: () => void;
  onFavoriteChange: () => void;
};

export function MediaCard({ media, onOpen, isFavorite, onFavoriteChange }: MediaCardProps) {
  const metadata = [media.year, media.rating?.value].filter((value) => value !== undefined);

  return (
    <article className="group relative min-w-0">
      <button type="button" className="block w-full min-w-0 text-left" onClick={onOpen}>
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

      <IconButton
        variant="ghost"
        size="small"
        aria-label={
          isFavorite
            ? `Удалить «${media.title}» из избранного`
            : `Добавить «${media.title}» в избранное`
        }
        aria-pressed={isFavorite}
        className={[
          'absolute right-2 top-2 rounded-full border border-transparent',
          'bg-transparent! text-white! drop-shadow-md',
          'hover:bg-black/55! hover:text-white!',
          'focus-visible:bg-black/55! focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-white',
          'transition-transform duration-200 hover:scale-110 active:scale-95',
        ].join(' ')}
        onClick={onFavoriteChange}
      >
        <FavoriteIcon
          className={[
            'size-5 transition-[transform,color,fill] duration-200 ease-out',
            isFavorite
              ? 'scale-110 fill-favorite text-favorite'
              : 'scale-100 fill-transparent text-white',
          ].join(' ')}
        />
      </IconButton>
    </article>
  );
}
