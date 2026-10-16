import { LandscapeMediaCard } from '@/entities/media';
import { ErrorState, LoadMoreButton, LoadingState, YaneMarkField } from '@/shared';

import { useEditorialCollection } from '../model/useEditorialCollection';

export function EditorialCollectionPage() {
  const { collection, status, isLoadingMore, loadMoreFailed, loadMore, retry } =
    useEditorialCollection();

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
    return <LoadingState variant="page" label="Собираем выбор редакции" />;
  }

  const hasMore = collection.nextOffset < collection.total;

  return (
    <section className="min-w-0 space-y-7 pb-4" aria-busy={isLoadingMore}>
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
              <span className="rounded-pill border border-context-border bg-watermark/15 px-3 py-1.5 font-semibold text-accent-text">
                {collection.total} произведений
              </span>
              <span className="max-w-full rounded-pill border border-border/70 bg-surface-elevated/55 px-3 py-1.5 text-text-secondary">
                Фильмы · Сериалы · Аниме
              </span>
            </div>
          </div>
        </div>
      </header>

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

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {collection.items.map((media) => (
          <LandscapeMediaCard key={media.mediaRef} media={media} />
        ))}
      </div>

      {(hasMore || loadMoreFailed) && (
        <div className="flex flex-col items-center gap-3 pt-2">
          {loadMoreFailed && (
            <p role="status" className="text-caption text-text-secondary">
              Следующую часть подборки не удалось загрузить.
            </p>
          )}

          <LoadMoreButton isLoading={isLoadingMore} hasError={loadMoreFailed} onClick={loadMore} />
        </div>
      )}
    </section>
  );
}
