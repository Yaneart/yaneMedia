import { ThemeToggle } from '@/features/theme';
import { Logo, YaneMark } from '@/shared';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';

export type AuthFormLayoutProps = {
  homePath: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

const authBackgroundMarks = [
  'left-[4%] top-[16%] size-11 -rotate-[18deg]',
  'left-[11%] top-[27%] size-9 rotate-[138deg]',
  'left-[18%] top-[11%] size-10 rotate-[24deg]',
  'left-[26%] top-[22%] size-8 -rotate-[28deg]',
  'left-[35%] top-[8%] size-9 rotate-[146deg]',
  'left-[46%] top-[18%] size-11 rotate-[20deg]',
  'right-[43%] top-[10%] size-8 -rotate-[22deg]',
  'right-[34%] top-[22%] size-10 rotate-[132deg]',
  'right-[25%] top-[9%] size-9 rotate-[28deg]',
  'right-[17%] top-[26%] size-11 -rotate-[20deg]',

  'right-[8%] top-[15%] size-10 rotate-[142deg]',
  'right-[3%] top-[31%] size-8 rotate-[24deg]',
  'left-[3%] top-[44%] size-9 rotate-[32deg]',
  'left-[13%] top-[53%] size-11 -rotate-[24deg]',
  'left-[5%] top-[66%] size-10 rotate-[136deg]',
  'left-[17%] top-[75%] size-8 rotate-[20deg]',
  'right-[4%] top-[45%] size-11 -rotate-[18deg]',
  'right-[14%] top-[54%] size-9 rotate-[148deg]',
  'right-[6%] top-[67%] size-10 rotate-[26deg]',
  'right-[18%] top-[76%] size-8 -rotate-[30deg]',

  'left-[4%] bottom-[10%] size-11 rotate-[138deg]',
  'left-[12%] bottom-[23%] size-8 -rotate-[20deg]',
  'left-[22%] bottom-[7%] size-10 rotate-[28deg]',
  'left-[32%] bottom-[17%] size-9 rotate-[146deg]',
  'left-[42%] bottom-[5%] size-8 -rotate-[24deg]',
  'right-[45%] bottom-[15%] size-10 rotate-[20deg]',
  'right-[34%] bottom-[6%] size-9 rotate-[136deg]',
  'right-[25%] bottom-[20%] size-11 -rotate-[28deg]',
  'right-[15%] bottom-[8%] size-8 rotate-[32deg]',
  'right-[5%] bottom-[22%] size-10 rotate-[142deg]',

  'left-[7%] top-[36%] size-8 -rotate-[26deg]',
  'left-[20%] top-[35%] size-10 rotate-[144deg]',
  'right-[7%] top-[37%] size-9 rotate-[22deg]',
  'right-[21%] top-[34%] size-8 -rotate-[18deg]',
  'left-[9%] top-[59%] size-11 rotate-[30deg]',
  'right-[10%] top-[61%] size-8 rotate-[138deg]',
  'left-[27%] bottom-[3%] size-9 -rotate-[24deg]',
  'right-[28%] bottom-[3%] size-10 rotate-[146deg]',
  'left-[51%] top-[3%] size-8 rotate-[20deg]',
  'left-[52%] bottom-[2%] size-9 -rotate-[28deg]',
];

export function AuthFormLayout({
  homePath,
  title,
  description,
  children,
  footer,
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
        <div className="flex min-h-20 items-center justify-between gap-4 px-page">
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

      <main className="relative z-10 flex min-h-0 flex-1 overflow-y-auto px-page py-8 sm:py-10">
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
              'bg-linear-to-br from-watermark/25 via-surface to-surface',
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
            className="flex items-center px-5 py-8 sm:px-10 sm:py-12 lg:px-12"
          >
            <div className="mx-auto w-full max-w-sm">
              <header className="mb-8">
                <h1 id={titleId} className="text-title text-text-primary">
                  {title}
                </h1>

                {description && (
                  <div className="mt-2 text-body text-text-secondary">{description}</div>
                )}
              </header>

              {children}

              {footer && (
                <div className="mt-8 border-t border-border pt-6 text-center text-caption text-text-secondary">
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
