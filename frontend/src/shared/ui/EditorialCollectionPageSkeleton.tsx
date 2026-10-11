import { Skeleton } from './Skeleton';

export function EditorialCollectionPageSkeleton() {
  return (
    <section aria-busy="true" className="min-w-0 space-y-7 pb-4">
      <p role="status" className="sr-only">
        Загружаем выбор редакции
      </p>

      <header
        aria-hidden="true"
        className={[
          'flex min-h-72 w-full max-w-full flex-col justify-end overflow-hidden rounded-card',
          'border border-context-border bg-linear-to-br from-watermark/45 via-watermark/15 to-surface-elevated',
          'px-6 py-8 shadow-surface sm:px-9 sm:py-10 lg:min-h-80 lg:px-12 lg:py-12',
        ].join(' ')}
      >
        <div className="flex min-h-56 max-w-2xl flex-col justify-end lg:min-h-60">
          <Skeleton className="h-4 w-64 max-w-full rounded-control" />
          <Skeleton className="mt-3 h-10 w-96 max-w-full rounded-control sm:h-14" />
          <Skeleton className="mt-4 h-5 w-full rounded-control" />
          <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
          <div className="mt-6 flex gap-2">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-8 w-44 rounded-full" />
          </div>
        </div>
      </header>

      <div aria-hidden="true">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-40 rounded-control" />
            <Skeleton className="mt-2 h-7 w-80 max-w-full rounded-control" />
          </div>
          <Skeleton className="h-4 w-28 rounded-control" />
        </div>

        <div className="mt-7 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full rounded-card" />
          ))}
        </div>
      </div>
    </section>
  );
}
