import { Button, FavoriteFilledIcon, FavoriteIcon } from '@/shared';

export type FavoriteButtonProps = {
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
  mediaTitle?: string;
  className?: string;
};

export function FavoriteButton({
  isFavorite,
  onFavoriteChange,
  mediaTitle,
  className = '',
}: FavoriteButtonProps) {
  const FavoriteStateIcon = isFavorite ? FavoriteFilledIcon : FavoriteIcon;
  const actionLabel = isFavorite ? 'Удалить из избранного' : 'Добавить в избранное';

  return (
    <Button
      variant="secondary"
      aria-label={mediaTitle ? `${actionLabel}: ${mediaTitle}` : actionLabel}
      aria-pressed={isFavorite}
      className={[
        'rounded-pill shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/40',
        isFavorite
          ? 'border-watermark/70 bg-watermark/15! hover:border-watermark/85 hover:bg-watermark/20!'
          : 'border-watermark/45 bg-surface-elevated! hover:border-watermark/70 hover:bg-watermark/10!',
        className,
      ].join(' ')}
      onClick={() => onFavoriteChange(!isFavorite)}
    >
      <FavoriteStateIcon
        className={[
          'size-5 transition-[transform,color] duration-200 ease-out',
          'motion-reduce:transform-none motion-reduce:transition-none',
          isFavorite ? 'scale-110 text-watermark!' : 'scale-100',
        ].join(' ')}
      />
      {isFavorite ? 'В избранном' : 'В избранное'}
    </Button>
  );
}
