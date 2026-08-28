import type { ComponentPropsWithRef } from 'react';

export type ContentRowVariant = 'continuation' | 'collection';

export type ContentRowProps = ComponentPropsWithRef<'div'> & {
  variant?: ContentRowVariant;
};

const variantClasses: Record<ContentRowVariant, string> = {
  continuation:
    'auto-cols-[88%] sm:auto-cols-[68%] md:auto-cols-[52%] xl:auto-cols-[38%] 2xl:auto-cols-[31%]',
  collection:
    'auto-cols-[76%] sm:auto-cols-[56%] md:auto-cols-[40%] xl:auto-cols-[28%] 2xl:auto-cols-[23%]',
};

export function ContentRow({ variant = 'collection', className = '', ...props }: ContentRowProps) {
  return (
    <div
      className={[
        'yane-content-scrollbar grid grid-flow-col gap-4 overflow-x-auto pb-2',
        'snap-x snap-proximity scroll-px-1',
        '[&>*]:snap-start',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
