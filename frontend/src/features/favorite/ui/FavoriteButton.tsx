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
        'group min-h-11 w-auto min-w-[10.5rem] justify-start gap-2 rounded-pill border p-1.5 pr-4',
        'text-sm text-text-primary shadow-sm transition-[background-color,border-color,box-shadow,transform]',
        'duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/50',
        'motion-reduce:transform-none motion-reduce:transition-none',
        isFavorite
          ? 'border-watermark/55 bg-watermark/10 hover:border-watermark/75 hover:bg-watermark/15'
          : 'border-watermark/25 bg-surface-elevated hover:border-watermark/60 hover:bg-watermark/5',
        className,
      ].join(' ')}
      onClick={() => onFavoriteChange(!isFavorite)}
    >
      <span
        className={[
          'grid size-8 shrink-0 place-items-center rounded-full text-watermark',
          'transition-colors duration-200 ease-out group-hover:bg-watermark/20',
          isFavorite ? 'bg-watermark/20' : 'bg-watermark/10',
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
