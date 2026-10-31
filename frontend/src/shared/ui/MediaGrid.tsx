import type { ComponentPropsWithRef } from 'react';
import { VirtualGrid } from './VirtualGrid';

export type MediaGridProps = ComponentPropsWithRef<'div'> & { virtualized?: boolean };

export function MediaGrid({ className = '', virtualized = false, ...props }: MediaGridProps) {
  return (
    <VirtualGrid
      enabled={virtualized}
      className={[
        'grid grid-cols-2 gap-x-4 gap-y-6',
        'lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
        className,
      ].join(' ')}
      {...props}
    />
  );
}
