import { Skeleton } from './Skeleton';
import { YaneMark, YaneMarkField } from './YaneMark';

export function MediaPageSkeleton() {
  return (
    <section aria-busy="true" className="media-view-container">
      <p role="status" className="sr-only">
        Загружаем произведение
      </p>

      <div aria-hidden="true" className="media-view media-view-with-description">
        <div className="media-view-info min-w-0">
          <div className="media-info-watch">
            <div className="media-info-poster">
              <Skeleton className="aspect-2/3 w-full rounded-overlay" />
            </div>
            <div className="media-info-content">
              <div className="media-info-heading min-w-0">
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="mt-1 h-5 w-3/5" />
                <Skeleton className="mt-2 h-5 w-2/3" />
              </div>
              <div className="media-info-actions min-w-0">
                <Skeleton className="h-11 w-44 max-w-full rounded-control" />
              </div>
              <div className="media-info-ratings flex min-w-0 flex-wrap items-center gap-2">
                <Skeleton className="h-9 w-16 rounded-control" />
                <Skeleton className="h-9 w-32 rounded-control" />
                <Skeleton className="h-9 w-20 rounded-control" />
              </div>
              <Skeleton className="media-info-facts h-5 w-4/5" />
            </div>
          </div>
        </div>

        <div className="media-view-playback min-w-0">
          <div className="media-player-frame min-w-0 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface">
            <div className="relative isolate overflow-hidden rounded-t-card bg-linear-to-br from-watermark/28 via-watermark/18 to-watermark/24">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <YaneMarkField />
                <YaneMark className="absolute -top-10 -right-12 size-56 rotate-[138deg] text-watermark opacity-[0.26]" />
              </div>
              <div className="relative z-10 flex min-w-0 items-center bg-surface/70 px-4 py-3">
                <Skeleton className="media-player-source-picker h-10 rounded-control" />
              </div>
            </div>
            <Skeleton className="aspect-video w-full !rounded-none" />
          </div>
        </div>

        <div className="media-view-details min-w-0 rounded-card border border-context-border bg-linear-to-br from-watermark/28 via-watermark/18 to-watermark/24 p-2 shadow-surface sm:p-3">
          <div className="space-y-3 rounded-card border border-context-border/80 bg-surface/70 p-3 sm:p-4">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <div className="media-view-community min-w-0">
          <div className="mb-3 flex gap-2 rounded-control border border-context-border bg-surface/70 p-1.5 shadow-surface">
            <Skeleton className="h-11 w-36 rounded-control" />
            <Skeleton className="h-11 w-28 rounded-control" />
          </div>
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    </section>
  );
}
