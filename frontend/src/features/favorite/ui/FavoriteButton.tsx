import { Button, FavoriteFilledIcon, FavoriteIcon } from '@/shared';

export type FavoriteButtonProps = {
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
  disabled?: boolean;
  mediaTitle?: string;
  className?: string;
};

export function FavoriteButton({
  isFavorite,
  onFavoriteChange,
  disabled = false,
  mediaTitle,
  className = '',
}: FavoriteButtonProps) {
  const FavoriteStateIcon = isFavorite ? FavoriteFilledIcon : FavoriteIcon;
  const actionLabel = isFavorite ? 'Удалить из избранного' : 'Добавить в избранное';

  return (
    <Button
      variant="bare"
      aria-label={mediaTitle ? `${actionLabel}: ${mediaTitle}` : actionLabel}
      aria-pressed={isFavorite}
      disabled={disabled}
      className={[
        'group min-h-11 w-auto min-w-[10.5rem] justify-start gap-2 rounded-pill border p-1.5 pr-4 backdrop-blur-md',
        'text-sm text-text-primary shadow-[0_8px_24px_rgb(0_0_0/18%)] transition-[background-color,border-color,box-shadow,transform]',
        'duration-200 ease-out hover:shadow-[0_0_0_1px_rgb(49_95_189/32%),0_0_18px_rgb(49_95_189/42%)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/50',
        'motion-reduce:transform-none motion-reduce:transition-none',
        isFavorite
          ? 'border-watermark/55 bg-watermark/30'
          : 'border-watermark/45 bg-watermark/20',
        className,
      ].join(' ')}
      onClick={() => onFavoriteChange(!isFavorite)}
    >
      <span
        className={[
          'grid size-8 shrink-0 place-items-center rounded-full text-watermark',
          'transition-colors duration-200 ease-out group-hover:bg-watermark/30',
          isFavorite ? 'bg-watermark/25' : 'bg-watermark/15',
        ].join(' ')}
      >
        <FavoriteStateIcon
          className={[
            'size-5 transition-transform duration-200 ease-out',
            'motion-reduce:transform-none motion-reduce:transition-none',
            isFavorite ? 'scale-110' : 'scale-100 group-hover:scale-110',
          ].join(' ')}
        />
      </span>
      {isFavorite ? 'В избранном' : 'В избранное'}
    </Button>
  );
}
