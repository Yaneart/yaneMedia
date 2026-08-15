import { FavoriteFilledIcon, FavoriteIcon, IconButton } from '@/shared';
import { MediaPosterFallback } from './MediaPosterFallback';
import type { MediaSummary } from '../model/media';

export type MediaCardProps = {
  media: MediaSummary;
  isFavorite: boolean;
  onOpen: () => void;
  onFavoriteChange: () => void;
};

export function MediaCard({ media, onOpen, isFavorite, onFavoriteChange }: MediaCardProps) {
  const metadata = [media.year, media.rating?.value].filter((value) => value !== undefined);
  const FavoriteStateIcon = isFavorite ? FavoriteFilledIcon : FavoriteIcon;

  return (
    <article className="relative min-w-0">
      <button
        type="button"
        className={[
          'group/card block w-full min-w-0 text-left',
          'transition-transform duration-200 ease-out',
          'active:scale-[0.99] active:duration-75',
          'motion-reduce:transform-none motion-reduce:transition-none',
        ].join(' ')}
        onClick={onOpen}
      >
        <div className="aspect-2/3 overflow-hidden rounded-card border border-context-border bg-elevated">
          {media.poster ? (
            <img
              src={media.poster.url}
              alt=""
              width={media.poster.width}
              height={media.poster.height}
              className={[
                'size-full object-cover transition-transform duration-300 ease-out',
                'group-hover/card:scale-[1.015] group-active/card:scale-[1.005]',
                'motion-reduce:transform-none motion-reduce:transition-none',
              ].join(' ')}
            />
          ) : (
            <MediaPosterFallback mediaRef={media.mediaRef} title={media.title} type={media.type} />
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
          'bg-transparent! text-watermark! drop-shadow-md',
          'hover:border-watermark/70 hover:bg-watermark/15! hover:text-watermark!',
          'focus-visible:border-watermark/70 focus-visible:bg-watermark/15! focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-watermark/60',
          'transition-transform duration-200 ease-out hover:scale-105 active:scale-95 active:duration-75',
          'motion-reduce:transform-none motion-reduce:transition-none',
        ].join(' ')}
        onClick={onFavoriteChange}
      >
        <FavoriteStateIcon
          className={[
            'size-5 transition-[transform,color] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none',
            isFavorite ? 'scale-110 text-watermark' : 'scale-100 text-watermark',
          ].join(' ')}
        />
      </IconButton>
    </article>
  );
}
