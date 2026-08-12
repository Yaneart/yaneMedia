import type { ComponentPropsWithRef } from 'react';

export type ContentRowProps = ComponentPropsWithRef<'div'>;

export function ContentRow({ className = '', ...props }: ContentRowProps) {
  return (
    <div
      className={[
        'grid grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto',
        'xl:auto-cols-[48%]',
        'min-[1400px]:grid-flow-row min-[1400px]:grid-cols-3 min-[1400px]:overflow-visible',
        className,
      ].join(' ')}
      {...props}
    />
  );
}
