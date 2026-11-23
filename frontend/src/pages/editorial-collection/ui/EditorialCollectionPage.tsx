import { MediaCard } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import {
  EditorialCollectionHeader,
  EditorialCollectionPageSkeleton,
  ErrorState,
  InfiniteScroll,
  MediaGrid,
} from '@/shared';

import { useEditorialCollection } from '../model/useEditorialCollection';

export function EditorialCollectionPage() {
  const { collection, status, pagination, retry } = useEditorialCollection();
  const { isFavorite, isFavoriteUpdating, toggleFavorite, canUpdateFavorites } = useFavorites();

  if (!collection && status === 'error') {
    return (
      <ErrorState
        variant="page"
        eyebrow="Редакционная коллекция"
        title="Не удалось загрузить подборку"
        description="Медиатека временно не отвечает. Попробуйте восстановить коллекцию ещё раз."
        visualLabel="Подборка недоступна"
        retryLabel="Попробовать снова"
        onRetry={retry}
      />
    );
  }

  if (!collection) {
    return <EditorialCollectionPageSkeleton />;
  }

  return (
    <section className="min-w-0 space-y-7 pb-4">
      <EditorialCollectionHeader total={collection.total} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
            Полная подборка
          </p>
          <h2 className="mt-1 text-heading text-text-primary">Истории, отобранные вручную</h2>
        </div>

        <p className="text-caption text-text-secondary">
          Показано{' '}
          <span className="font-semibold text-text-primary">{collection.items.length}</span> из{' '}
          {collection.total}
        </p>
      </div>

      <MediaGrid virtualized>
        {collection.items.map((media) => (
          <MediaCard
            key={media.mediaRef}
            media={media}
            isFavorite={isFavorite(media.mediaRef)}
            favoriteDisabled={!canUpdateFavorites || isFavoriteUpdating(media.mediaRef)}
            onFavoriteChange={() => toggleFavorite(media.mediaRef)}
          />
        ))}
      </MediaGrid>

      <InfiniteScroll
        query={pagination}
        errorMessage="Следующую часть подборки не удалось загрузить."
      />
    </section>
  );
}
