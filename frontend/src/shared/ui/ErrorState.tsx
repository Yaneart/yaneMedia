import { Button } from './Button';
import type { ComponentPropsWithRef } from 'react';

export type ErrorStateProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'title'> & {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Повторить',
  className = '',
  ...props
}: ErrorStateProps) {
  return (
    <div
      {...props}
      role="alert"
      className={[
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      ].join(' ')}
    >
      <p className="text-heading text-error">{title}</p>

      {description && <p className="mt-2 max-w-lg text-body text-text-secondary">{description}</p>}

      {onRetry && (
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
