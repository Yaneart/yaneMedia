import { MediaGrid } from './MediaGrid';
import { Skeleton } from './Skeleton';

export function SearchPageSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <p role="status" className="sr-only">
        Загружаем поиск
      </p>

      <div
        aria-hidden="true"
        className={[
          'rounded-card border border-border bg-linear-to-br',
          'from-watermark/50 via-surface-elevated to-surface-elevated px-5 py-6 shadow-sm',
          'sm:px-7 sm:py-7',
          'lg:grid lg:grid-cols-[minmax(18rem,0.75fr)_minmax(28rem,1.25fr)]',
          'lg:items-center lg:gap-10 lg:px-10 lg:py-8',
        ].join(' ')}
      >
        <div>
          <Skeleton className="h-4 w-36 rounded-control" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full rounded-control" />
          <Skeleton className="mt-3 h-5 w-80 max-w-full rounded-control" />
        </div>

        <div className="mt-5 lg:mt-0">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-11 min-w-0 flex-1 rounded-control" />
            <Skeleton className="h-11 w-full rounded-control sm:w-28" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
        </div>
      </div>

      <div aria-hidden="true">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-36 rounded-control" />
            <Skeleton className="mt-2 h-7 w-52 max-w-full rounded-control" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>

        <MediaGrid>
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index}>
              <Skeleton className="aspect-2/3 rounded-card" />
              <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
              <Skeleton className="mt-1 h-4 w-2/5 rounded-control" />
            </div>
          ))}
        </MediaGrid>
      </div>
    </div>
  );
}
