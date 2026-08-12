import type { ComponentPropsWithRef } from 'react';

export type ContentRowProps = ComponentPropsWithRef<'div'>;

export function ContentRow({ className = '', ...props }: ContentRowProps) {
  return (
    <div
      className={[
        'grid grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto',
        'xl:grid-flow-row xl:grid-cols-3 xl:overflow-visible',
        className,
      ].join(' ')}
      {...props}
    />
  );
}
