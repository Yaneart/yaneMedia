import { MediaGrid, Skeleton } from '@/shared';

export type LibraryPageSkeletonProps = {
  variant: 'favorites' | 'history';
};

export function LibraryPageSkeleton({ variant }: LibraryPageSkeletonProps) {
  const isHistory = variant === 'history';

  return (
    <section aria-busy="true">
      <p role="status" className="sr-only">
        Загружаем {isHistory ? 'историю' : 'избранное'}
      </p>

      <header
        aria-hidden="true"
        className="relative mb-8 flex min-h-40 flex-col justify-center overflow-hidden pb-7 sm:min-h-44 sm:pb-8"
      >
        <span className="absolute right-0 bottom-0 left-0 h-px bg-context-border" />
        <span className="absolute bottom-0 left-0 h-0.5 w-24 rounded-pill bg-watermark" />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between md:pr-52">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40 rounded-control" />
            </div>
            <Skeleton className="mt-3 h-12 w-72 max-w-full rounded-control sm:h-14" />
            <Skeleton className="mt-2 h-5 w-96 max-w-full rounded-control" />
          </div>

          <Skeleton className="h-8 w-28 shrink-0 rounded-full" />
        </div>
      </header>

      <div aria-hidden="true">
        <div className="mb-5 flex items-center gap-3 rounded-card bg-watermark/10 px-4 py-3">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-3/4 rounded-control" />
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-card border border-context-border bg-surface-elevated p-4 sm:flex-row sm:items-center">
          <Skeleton className="h-11 w-full rounded-control sm:max-w-md" />
          <Skeleton className="h-4 w-16 rounded-control sm:ml-auto" />
        </div>

        <MediaGrid>
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="min-w-0">
              <Skeleton className="aspect-2/3 rounded-card" />
              <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
              <Skeleton className="mt-1 h-4 w-2/5 rounded-control" />
              {isHistory && <Skeleton className="mt-2 h-8 w-full rounded-control" />}
            </div>
          ))}
        </MediaGrid>
      </div>
    </section>
  );
}
