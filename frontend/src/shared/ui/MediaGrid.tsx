import type { ComponentPropsWithRef } from 'react';

export type MediaGridProps = ComponentPropsWithRef<'div'>;

export function MediaGrid({ className = '', ...props }: MediaGridProps) {
  return (
    <div
      className={[
        'grid grid-cols-2 gap-x-4 gap-y-6',
        'lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
        className,
      ].join(' ')}
      {...props}
    />
  );
}
