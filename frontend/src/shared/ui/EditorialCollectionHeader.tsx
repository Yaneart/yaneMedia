import { Skeleton } from './Skeleton';
import { YaneMarkField } from './YaneMark';

export function EditorialCollectionHeader({ total }: { total?: number }) {
  return (
    <header
      className={[
        'relative isolate w-full max-w-full overflow-hidden rounded-card border border-context-border',
        'bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <YaneMarkField />
      </div>

      <div className="relative z-10 flex min-h-72 min-w-0 flex-col justify-end overflow-hidden rounded-card border border-context-border/80 bg-surface/35 px-5 py-6 sm:min-h-80 sm:px-8 sm:py-8 lg:min-h-88 lg:px-10">
        <div className="relative max-w-3xl">
          <p className="max-w-full text-caption font-semibold tracking-[0.16em] break-words text-accent-text uppercase">
            Кураторская коллекция yaneMedia
          </p>

          <h1
            data-page-heading
            tabIndex={-1}
            className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
          >
            Выбор редакции
          </h1>

          <p className="mt-3 max-w-xl text-body break-words text-text-secondary sm:text-lg">
            Фильмы, сериалы и аниме, к которым хочется возвращаться — без рейтинга популярности и
            случайных рекомендаций.
          </p>

          <div className="mt-5 flex max-w-full flex-col items-start gap-2 text-caption sm:flex-row sm:flex-wrap">
            <div className="rounded-pill border border-context-border bg-watermark/15 px-3 py-1.5 font-semibold text-accent-text">
              {total === undefined ? (
                <Skeleton className="inline-block h-[1em] w-6 rounded-control align-middle" />
              ) : (
                total
              )}{' '}
              произведений
            </div>
            <span className="max-w-full rounded-pill border border-border/70 bg-surface-elevated/55 px-3 py-1.5 text-text-secondary">
              Фильмы · Сериалы · Аниме
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
