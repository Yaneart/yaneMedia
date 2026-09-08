import { ContentRow, Skeleton } from '@/shared';

export function MediaCatalogSkeleton({ title }: { title: string }) {
  return (
    <section aria-busy="true" className="space-y-8">
      <p role="status" className="sr-only">
        Загружаем каталог «{title}»
      </p>

      <div aria-hidden="true" className="rounded-card bg-surface-elevated p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-5 h-11 w-full" />
      </div>

      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true">
          <Skeleton className="mb-4 h-7 w-48" />

          <ContentRow>
            {[0, 1, 2, 3].map((card) => (
              <div key={card}>
                <Skeleton className="aspect-2/3 rounded-card" />
                <Skeleton className="mt-2 h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            ))}
          </ContentRow>
        </div>
      ))}
    </section>
  );
}
