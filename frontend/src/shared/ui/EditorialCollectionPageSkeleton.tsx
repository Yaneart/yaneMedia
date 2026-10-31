import { EditorialCollectionHeader } from './EditorialCollectionHeader';
import { MediaGrid } from './MediaGrid';
import { Skeleton } from './Skeleton';

export function EditorialCollectionPageSkeleton() {
  return (
    <section aria-busy="true" className="min-w-0 space-y-7 pb-4">
      <p role="status" className="sr-only">
        Загружаем выбор редакции
      </p>

      <EditorialCollectionHeader />

      <div aria-hidden="true">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
              Полная подборка
            </p>
            <h2 className="mt-1 text-heading text-text-primary">Истории, отобранные вручную</h2>
          </div>
          <Skeleton className="h-5 w-28 rounded-control" />
        </div>

        <MediaGrid className="mt-7">
          {Array.from({ length: 24 }, (_, index) => (
            <div key={index}>
              <Skeleton className="aspect-2/3 rounded-card" />
              <Skeleton className="mt-2 h-6 w-4/5 rounded-control" />
              <Skeleton className="mt-1 h-4 w-2/5 rounded-control" />
            </div>
          ))}
        </MediaGrid>
      </div>
    </section>
  );
}
