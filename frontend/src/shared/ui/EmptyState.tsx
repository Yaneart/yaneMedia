import type { ComponentPropsWithRef, ReactNode } from 'react';

export type EmptyStateProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'title'> & {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      ].join(' ')}
      {...props}
    >
      <p className="text-heading text-text-primary">{title}</p>

      {description && <p className="mt-2 max-w-md text-body text-text-secondary">{description}</p>}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
