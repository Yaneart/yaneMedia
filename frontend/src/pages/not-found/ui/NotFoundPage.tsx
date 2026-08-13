import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { routePaths } from '@/app/router/routes';
import { Button, PlayIcon } from '@/shared';

type PlaybackState = 'idle' | 'loading' | 'error';

export function NotFoundPage() {
  const navigate = useNavigate();
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');

  useEffect(() => {
    if (playbackState !== 'loading') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPlaybackState('error');
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [playbackState]);

  const statusText = {
    idle: 'Нажмите, чтобы продолжить',
    loading: 'Поиск кадра',
    error: 'Кадр не найден',
  }[playbackState];

  return (
    <section className="flex min-h-full items-center justify-center py-8">
      <div className="w-full max-w-5xl">
        <div className="relative before:absolute before:inset-x-[12%] before:-bottom-4 before:h-24 before:rounded-full before:bg-text-primary/10 before:blur-3xl">
          <div
            aria-busy={playbackState === 'loading'}
            className="relative aspect-video overflow-hidden rounded-card border border-border bg-background shadow-overlay"
          >
            <div
              className={[
                'absolute inset-0 flex flex-col items-center justify-center px-4 pb-8 text-center sm:translate-y-8 sm:pb-20',
                playbackState !== 'error' ? 'max-[374px]:pb-14' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-center gap-2 max-[374px]:translate-y-1 sm:gap-6">
                <span className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] text-text-primary sm:text-[clamp(3.5rem,10vw,8rem)]">
                  04
                </span>

                <button
                  type="button"
                  aria-label={
                    playbackState === 'error'
                      ? 'Повторить попытку воспроизведения'
                      : 'Попробовать воспроизвести'
                  }
                  disabled={playbackState === 'loading'}
                  onClick={() => setPlaybackState('loading')}
                  className={[
                    'flex size-14 shrink-0 items-center justify-center rounded-full border',
                    'bg-surface text-text-primary shadow-overlay',
                    'transition-[background-color,border-color,transform] duration-200 ease-out',
                    'hover:scale-[1.025] hover:bg-interactive-hover',
                    'active:scale-[0.975] active:duration-75',
                    'motion-reduce:transform-none motion-reduce:transition-none',
                    'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action',
                    'disabled:pointer-events-none',
                    'sm:size-24',
                    playbackState === 'error' ? 'border-error' : 'border-border',
                  ].join(' ')}
                >
                  {playbackState === 'loading' ? (
                    <span
                      aria-hidden="true"
                      className="size-6 animate-spin rounded-full border-2 border-text-secondary border-t-text-primary motion-reduce:animate-none sm:size-8"
                    />
                  ) : (
                    <PlayIcon className="size-6 translate-x-0.5 sm:size-10" />
                  )}
                </button>

                <span className="font-mono text-5xl leading-none font-semibold tracking-[-0.08em] text-text-primary sm:text-[clamp(3.5rem,10vw,8rem)]">
                  04
                </span>
              </div>

              <p
                role="status"
                className={[
                  'mt-3 text-caption tracking-[0.18em] uppercase sm:mt-5',
                  playbackState === 'error' ? 'text-error' : 'text-text-secondary',
                ].join(' ')}
              >
                {statusText}
              </p>

              <div aria-hidden="true" className="mt-3 hidden min-h-10 place-items-center sm:grid">
                <div
                  className={[
                    'rounded-overlay border border-border/70 bg-surface/80 px-3 py-1.5 sm:px-4 sm:py-2',
                    'shadow-overlay backdrop-blur-md',
                    'transition-[opacity,transform] duration-200 ease-out',
                    'motion-reduce:transform-none motion-reduce:transition-none',
                    playbackState === 'error'
                      ? 'translate-y-0 opacity-100'
                      : 'translate-y-1 opacity-0',
                  ].join(' ')}
                >
                  <p className="hidden font-mono text-[0.625rem] tracking-[0.18em] text-text-disabled uppercase sm:block">
                    Скрытый субтитр · 04:04
                  </p>
                  <p className="text-sm font-medium text-text-primary sm:mt-0.5">— я не Артём.</p>
                </div>
              </div>
            </div>

            <div className="absolute right-4 bottom-4 left-4 sm:right-6 sm:bottom-6 sm:left-6">
              <div className="group/timeline relative flex items-center gap-3 py-3">
                <div className="h-1 flex-1 rounded-pill bg-action" />

                <div className="relative">
                  <div
                    className={[
                      'size-2 rounded-full transition-[background-color,transform] duration-200 ease-out',
                      'motion-reduce:transform-none motion-reduce:transition-none',
                      playbackState === 'error'
                        ? 'scale-125 bg-error'
                        : 'bg-text-secondary group-hover/timeline:scale-125 group-hover/timeline:bg-action',
                    ].join(' ')}
                  />

                  <span
                    className={[
                      'absolute bottom-5 left-1/2 hidden -translate-x-1/2 rounded-pill sm:block',
                      'border border-border bg-surface-elevated px-2 py-1',
                      'text-caption whitespace-nowrap text-text-primary',
                      'transition-[opacity,transform] duration-200 ease-out',
                      'motion-reduce:transform-none motion-reduce:transition-none',
                      playbackState === 'error'
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-1 opacity-0 group-hover/timeline:translate-y-0 group-hover/timeline:opacity-100',
                    ].join(' ')}
                  >
                    04:04
                  </span>
                </div>

                <div className="h-1 flex-1 rounded-pill bg-border" />
              </div>

              <div className="flex items-center justify-between text-caption text-text-secondary">
                <span>00:04</span>
                <span>04:04</span>
              </div>
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="mt-3 flex min-h-8 justify-center sm:hidden">
          <div
            className={[
              'flex items-center gap-2 rounded-pill border border-border/70 bg-surface-elevated px-3 py-1.5',
              'shadow-overlay transition-[opacity,transform] duration-200 ease-out',
              'motion-reduce:transform-none motion-reduce:transition-none',
              playbackState === 'error' ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
            ].join(' ')}
          >
            <span className="font-mono text-[0.625rem] tracking-[0.16em] text-text-disabled">
              04:04
            </span>
            <span className="text-xs font-medium text-text-primary">— я не Артём.</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-6 text-center sm:mt-7 sm:flex-row sm:justify-between sm:text-left">
          <div className="max-w-xl">
            <p className="mb-2 text-caption tracking-[0.16em] text-text-secondary uppercase">
              Ошибка 404
            </p>

            <h1 className="text-heading text-text-primary">Этой страницы нет в медиатеке</h1>

            <p className="mt-2 text-body text-text-secondary">
              Возможно, ссылка устарела или была указана неверно.
            </p>
          </div>

          <Button className="shrink-0" onClick={() => navigate(routePaths.home)}>
            Вернуться на главную
          </Button>
        </div>
      </div>
    </section>
  );
}
