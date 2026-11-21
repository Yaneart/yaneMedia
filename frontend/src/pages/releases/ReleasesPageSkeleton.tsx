import { MediaGrid, Skeleton, YaneMark } from '@/shared';

export function ReleasesPageSkeleton() {
  return (
    <section aria-busy="true">
      <p role="status" className="sr-only">
        Загружаем страницу новинок
      </p>
      <div aria-hidden="true" className="relative isolate overflow-hidden pt-2 sm:pt-5">
        <YaneMark className="pointer-events-none absolute -top-14 -right-8 -z-10 size-72 -rotate-12 text-watermark opacity-[0.07] sm:right-8 sm:size-96" />
        <div className="max-w-2xl py-4 sm:py-6">
          <Skeleton className="h-4 w-40 bg-watermark/20" />
          <Skeleton className="mt-3 h-10 w-52 sm:h-12 sm:w-64" />
          <Skeleton className="mt-3 h-6 w-full max-w-lg" />
          <Skeleton className="mt-2 h-6 w-2/3 max-w-sm" />
        </div>
        <div className="mt-4 flex flex-col gap-4 border-b border-context-border sm:mt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="flex gap-5 sm:gap-8">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex min-h-12 items-center pb-3">
                <Skeleton className={`h-5 w-20 sm:w-24 ${index === 0 ? 'bg-watermark/20' : ''}`} />
              </div>
            ))}
          </div>
          <div className="mb-3 flex w-fit gap-1 rounded-full border border-context-border bg-surface-elevated p-1">
            <Skeleton className="h-9 w-24 rounded-full bg-watermark/20" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="mt-6 sm:mt-8">
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
    </section>
  );
}
