import type { ComponentPropsWithRef, ReactNode } from 'react';

export type EmptyStateProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'title'> & {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
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
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-watermark/10 text-watermark">
          {icon}
        </div>
      )}

      <p className="text-heading text-text-primary">{title}</p>

      {description && <p className="mt-2 max-w-lg text-body text-text-secondary">{description}</p>}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
