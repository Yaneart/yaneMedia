import type { ReactNode } from 'react';

import { YaneMark } from '@/shared';

type LibraryPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  actions?: ReactNode;
};

export function LibraryPageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: LibraryPageHeaderProps) {
  return (
    <header
      className={[
        'relative mb-8 min-h-40 overflow-hidden pb-7',
        'flex flex-col justify-center sm:min-h-44 sm:pb-8',
      ].join(' ')}
    >
      <YaneMark
        aria-hidden="true"
        className={[
          'pointer-events-none absolute -right-10 top-1/2 hidden h-52 w-80 -translate-y-1/2 -rotate-6',
          'text-watermark opacity-watermark md:block',
        ].join(' ')}
      />
      <span
        aria-hidden="true"
        className="absolute right-0 bottom-0 left-0 h-px bg-context-border"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-0.5 w-24 rounded-pill bg-watermark"
      />

      <div className="relative flex flex-col gap-5 pr-0 sm:flex-row sm:items-end sm:justify-between md:pr-52">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-watermark/10 text-watermark">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
                {eyebrow}
              </p>
            </div>
          </div>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-text-primary sm:text-5xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-body text-text-secondary">{description}</p>
        </div>

        {actions && <div className="shrink-0 sm:pb-1">{actions}</div>}
      </div>
    </header>
  );
}
