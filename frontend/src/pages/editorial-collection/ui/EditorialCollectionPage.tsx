import { useNavigate } from 'react-router';

import { LandscapeMediaCard, type MediaRef } from '@/entities/media';
import { Button, ErrorState, LoadingState, YaneMark } from '@/shared';

import { useEditorialCollection } from '../model/useEditorialCollection';

export function EditorialCollectionPage() {
  const navigate = useNavigate();
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

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };
  const hasMore = collection.nextOffset < collection.total;

  return (
    <section className="min-w-0 space-y-7 pb-4" aria-busy={isLoadingMore}>
      <header
        className={[
          'relative isolate min-h-72 w-full max-w-full overflow-hidden rounded-card',
          'border border-context-border',
          'bg-linear-to-br from-watermark/45 via-watermark/15 to-surface-elevated',
          'px-6 py-8 shadow-surface sm:px-9 sm:py-10 lg:min-h-80 lg:px-12 lg:py-12',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <YaneMark className="absolute -top-28 -right-14 size-96 rotate-12 text-watermark/55" />
          <YaneMark className="absolute -right-6 -bottom-40 hidden size-80 -rotate-12 text-watermark/30 sm:block" />
          <YaneMark className="absolute top-10 right-[34%] hidden size-36 rotate-45 text-watermark/15 lg:block" />
          <div className="absolute inset-0 bg-linear-to-r from-surface-elevated/55 via-transparent to-transparent" />
        </div>

        <div className="relative flex min-h-56 min-w-0 max-w-2xl flex-col justify-end lg:min-h-60">
          <p className="max-w-full text-caption font-semibold tracking-[0.16em] break-words text-accent-text uppercase">
            Кураторская коллекция yaneMedia
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
            Выбор редакции
          </h1>

          <p className="mt-4 max-w-xl text-body break-words text-text-secondary sm:text-lg">
            Пятьдесят фильмов, сериалов и аниме, к которым хочется возвращаться — без рейтинга
            популярности и случайных рекомендаций.
          </p>

          <div className="mt-6 flex max-w-full flex-col items-start gap-2 text-caption sm:flex-row sm:flex-wrap">
            <span className="rounded-pill border border-context-border bg-watermark/15 px-3 py-1.5 font-semibold text-accent-text">
              {collection.total} произведений
            </span>
            <span className="max-w-full rounded-pill border border-border/70 bg-surface-elevated/55 px-3 py-1.5 text-text-secondary">
              Фильмы · Сериалы · Аниме
            </span>
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
          <LandscapeMediaCard
            key={media.mediaRef}
            media={media}
            onOpen={() => openMedia(media.mediaRef)}
          />
        ))}
      </div>

      {(hasMore || loadMoreFailed) && (
        <div className="flex flex-col items-center gap-3 pt-2">
          {loadMoreFailed && (
            <p role="status" className="text-caption text-text-secondary">
              Следующую часть подборки не удалось загрузить.
            </p>
          )}

          <Button
            variant="secondary"
            size="large"
            disabled={isLoadingMore}
            className="min-w-52 border-context-border bg-watermark/15 text-accent-text hover:bg-watermark/25"
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? 'Загружаем…' : loadMoreFailed ? 'Повторить' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </section>
  );
}
