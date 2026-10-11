import { Button, type ButtonProps } from './Button';

export type LoadMoreButtonProps = Omit<
  ButtonProps,
  'children' | 'variant' | 'size' | 'iconOnly'
> & {
  isLoading: boolean;
  hasError?: boolean;
};

export function LoadMoreButton({
  isLoading,
  hasError = false,
  disabled,
  className = '',
  ...props
}: LoadMoreButtonProps) {
  return (
    <Button
      {...props}
      variant="secondary"
      size="large"
      disabled={disabled || isLoading}
      className={[
        'load-more-button min-w-52 border-[var(--theme-watch-dock-border)]',
        'bg-control px-7 text-text-primary shadow-sm hover:bg-control-hover',
        className,
      ].join(' ')}
    >
      {isLoading ? 'Загружаем…' : hasError ? 'Попробовать снова' : 'Показать ещё'}
    </Button>
  );
}
