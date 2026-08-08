import type { ComponentPropsWithRef } from 'react';

export type SkeletonProps = Omit<ComponentPropsWithRef<'div'>, 'children'>;

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden
      className={[
        'animate-pulse rounded-overlay bg-skeleton',
        'motion-reduce:animate-none',
        className,
      ].join(' ')}
    />
  );
}
