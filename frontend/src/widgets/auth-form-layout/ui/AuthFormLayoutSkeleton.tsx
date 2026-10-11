import { Logo, mainContentId, Skeleton, YaneMark } from '@/shared';
import { authBackgroundMarks } from './authBackgroundMarks';

export type AuthFormLayoutSkeletonProps = {
  variant: 'login' | 'register';
};

const fieldMessageSpace = {
  login: [true, true],
  register: [true, false, true, false],
} satisfies Record<AuthFormLayoutSkeletonProps['variant'], boolean[]>;

export function AuthFormLayoutSkeleton({ variant }: AuthFormLayoutSkeletonProps) {
  const compactMobile = variant === 'register';

  return (
    <div
      aria-busy="true"
      className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background"
    >
      <p role="status" className="sr-only">
        Загружаем форму
      </p>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block"
      >
        {authBackgroundMarks.map((className) => (
          <YaneMark
            key={className}
            className={`absolute ${className} text-watermark opacity-watermark`}
          />
        ))}
      </div>

      <header aria-hidden="true" className="relative z-20 shrink-0 pt-[env(safe-area-inset-top)]">
        <div
          className={[
            'flex items-center justify-between gap-4 px-page',
            compactMobile ? 'min-h-16 sm:min-h-20' : 'min-h-20',
          ].join(' ')}
        >
          <div className="-ml-2 p-2">
            <Logo />
          </div>
          <Skeleton className="h-10 w-28 rounded-control" />
        </div>
      </header>

      <main
        id={mainContentId}
        className={[
          'relative z-10 flex min-h-0 flex-1 overflow-y-auto px-page',
          compactMobile
            ? 'pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-10'
            : 'py-8 sm:py-10',
        ].join(' ')}
      >
        <div
          aria-hidden="true"
          className={[
            'm-auto grid w-full max-w-5xl overflow-hidden',
            'rounded-card border border-watermark/40',
            'bg-surface-elevated shadow-surface',
            'lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]',
          ].join(' ')}
        >
          <div
            className={[
              'relative hidden min-h-[34rem] overflow-hidden p-10',
              'bg-linear-to-br from-watermark/50 via-surface to-surface',
              'lg:flex lg:flex-col',
            ].join(' ')}
          >
            <YaneMark className="absolute -right-32 -top-8 size-[40rem] rotate-[18deg] text-watermark opacity-[0.16]" />
            <YaneMark className="absolute -bottom-24 -left-24 size-80 -rotate-[28deg] text-watermark opacity-10" />

            <div className="relative mt-auto max-w-sm">
              <Skeleton className="h-8 w-72 max-w-full rounded-control" />
              <Skeleton className="mt-4 h-5 w-full rounded-control" />
              <Skeleton className="mt-2 h-5 w-5/6 rounded-control" />
            </div>
          </div>

          <section
            className={[
              'flex items-center px-5 sm:px-10 sm:py-12 lg:px-12',
              compactMobile ? 'py-6' : 'py-8',
            ].join(' ')}
          >
            <div className="mx-auto w-full max-w-sm">
              <header className={compactMobile ? 'mb-6 sm:mb-8' : 'mb-8'}>
                <Skeleton className="h-8 w-44 rounded-control" />
                <Skeleton className="mt-3 h-5 w-64 max-w-full rounded-control" />
              </header>

              <div className="flex flex-col gap-2">
                {fieldMessageSpace[variant].map((reserveMessageSpace, index) => (
                  <div key={index} className="flex w-full flex-col gap-2">
                    <Skeleton className={`h-5 rounded-control ${index % 2 ? 'w-16' : 'w-28'}`} />
                    <Skeleton className="h-11 w-full rounded-control" />
                    {reserveMessageSpace && <div className="h-5" />}
                  </div>
                ))}

                {variant === 'login' && <Skeleton className="h-5 w-32 self-end rounded-control" />}

                <Skeleton className="h-12 w-full rounded-control" />
              </div>

              <div
                className={[
                  'border-t border-border text-center',
                  compactMobile ? 'mt-6 pt-5 sm:mt-8 sm:pt-6' : 'mt-8 pt-6',
                ].join(' ')}
              >
                <Skeleton className="mx-auto h-4 w-56 max-w-full rounded-control" />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
