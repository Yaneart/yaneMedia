import { ThemeToggle } from '@/features/theme';
import { Logo, mainContentId, YaneMark } from '@/shared';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { authBackgroundMarks } from './authBackgroundMarks';

export type AuthFormLayoutProps = {
  homePath: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  compactMobile?: boolean;
};

export function AuthFormLayout({
  homePath,
  title,
  description,
  children,
  footer,
  compactMobile = false,
}: AuthFormLayoutProps) {
  const titleId = useId();

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
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
      <header className="relative z-20 shrink-0 pt-[env(safe-area-inset-top)]">
        <div
          className={[
            'flex items-center justify-between gap-4 px-page',
            compactMobile ? 'min-h-16 sm:min-h-20' : 'min-h-20',
          ].join(' ')}
        >
          <Link
            to={homePath}
            aria-label="Перейти на главную"
            className={[
              '-ml-2 rounded-control p-2',
              'transition-transform duration-200 ease-out',
              'active:scale-[0.98] active:duration-75',
              'motion-reduce:transform-none motion-reduce:transition-none',
            ].join(' ')}
          >
            <Logo />
          </Link>

          <ThemeToggle />
        </div>
      </header>

      <main
        id={mainContentId}
        tabIndex={-1}
        className={[
          'relative z-10 flex min-h-0 flex-1 overflow-y-auto px-page',
          compactMobile
            ? 'pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-10'
            : 'py-8 sm:py-10',
        ].join(' ')}
      >
        <div
          className={[
            'm-auto grid w-full max-w-5xl overflow-hidden',
            'rounded-card border border-watermark/40',
            'bg-surface-elevated shadow-surface',
            'lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]',
          ].join(' ')}
        >
          <div
            aria-hidden="true"
            className={[
              'relative hidden min-h-[34rem] overflow-hidden p-10',
              'bg-linear-to-br from-watermark/50 via-surface to-surface',
              'lg:flex lg:flex-col',
            ].join(' ')}
          >
            <YaneMark
              className={[
                'absolute -right-32 -top-8 size-[40rem]',
                'rotate-[18deg] text-watermark opacity-[0.16]',
              ].join(' ')}
            />

            <YaneMark
              className={[
                'absolute -bottom-24 -left-24 size-80',
                '-rotate-[28deg] text-watermark opacity-10',
              ].join(' ')}
            />

            <div className="relative mt-auto max-w-sm">
              <p className="text-title text-text-primary">
                Истории, к которым хочется возвращаться
              </p>

              <p className="mt-3 text-body text-text-secondary">
                Сохраняйте избранное, продолжайте просмотр и держите свою медиатеку рядом.
              </p>
            </div>
          </div>

          <section
            aria-labelledby={titleId}
            className={[
              'flex items-center px-5 sm:px-10 sm:py-12 lg:px-12',
              compactMobile ? 'py-6' : 'py-8',
            ].join(' ')}
          >
            <div className="mx-auto w-full max-w-sm">
              <header className={compactMobile ? 'mb-6 sm:mb-8' : 'mb-8'}>
                <h1
                  id={titleId}
                  data-page-heading
                  tabIndex={-1}
                  className="text-title text-text-primary"
                >
                  {title}
                </h1>

                {description && (
                  <div className="mt-2 text-body text-text-secondary">{description}</div>
                )}
              </header>

              {children}

              {footer && (
                <div
                  className={[
                    'border-t border-border text-center text-caption text-text-secondary',
                    compactMobile ? 'mt-6 pt-5 sm:mt-8 sm:pt-6' : 'mt-8 pt-6',
                  ].join(' ')}
                >
                  {footer}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
