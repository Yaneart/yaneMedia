import type { ReactNode } from 'react';

import { YaneMark } from '@/shared';

type LibraryEmptyStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  action: ReactNode;
};

export function LibraryEmptyState({
  eyebrow,
  title,
  description,
  icon,
  action,
}: LibraryEmptyStateProps) {
  return (
    <div
      className={[
        'mx-auto grid max-w-4xl items-center gap-7 py-6 sm:py-10',
        'md:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)] md:gap-10 md:py-12',
      ].join(' ')}
    >
      <div
        aria-hidden="true"
        className={[
          'relative mx-auto flex size-40 items-center justify-center overflow-hidden rounded-[2rem]',
          'border border-context-border bg-linear-to-br from-watermark/25 via-surface-elevated to-surface-elevated',
          'shadow-sm sm:size-48 md:size-56',
        ].join(' ')}
      >
        <YaneMark className="absolute -right-14 -bottom-8 h-[92%] w-[155%] rotate-12 text-watermark/35" />
        <div
          className={[
            'relative flex size-16 items-center justify-center rounded-full',
            'border border-context-border bg-surface-elevated/90 text-watermark shadow-overlay backdrop-blur-sm',
          ].join(' ')}
        >
          {icon}
        </div>
      </div>

      <div className="text-center md:text-left">
        <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary md:mx-0">
          {description}
        </p>
        <div className="mt-6">{action}</div>
      </div>
    </div>
  );
}
