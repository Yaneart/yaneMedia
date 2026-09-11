import { MediaCard, useMediaSummaryResolution } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import {
  Button,
  EmptyState,
  ErrorState,
  FavoriteIcon,
  LoadingState,
  MediaGrid,
  SearchIcon,
} from '@/shared';
import {
  LibraryDataNotice,
  LibraryEmptyState,
  LibraryPageHeader,
  LibrarySearch,
  LibraryStorageNotice,
  matchesLibraryQuery,
} from '@/widgets/library-page';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export function FavoritesPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { favoriteMediaRefs, isFavorite, toggleFavorite } = useFavorites();
  const { resolution, status, hasRefreshError, retry } = useMediaSummaryResolution(
    Array.from(favoriteMediaRefs),
  );
  const favoriteMedia =
    resolution?.items.filter((media) => favoriteMediaRefs.has(media.mediaRef)) ?? [];
  const visibleFavoriteMedia = favoriteMedia.filter((media) => matchesLibraryQuery(media, query));
  const hasStoredFavorites = favoriteMediaRefs.size > 0;

  return (
    <section>
      <LibraryPageHeader
        eyebrow="Личная медиатека"
        title="Избранное"
        description="Сохранённые фильмы, сериалы и аниме"
        icon={<FavoriteIcon className="size-6" />}
        actions={
          favoriteMedia.length > 0 ? (
            <p className="w-fit shrink-0 rounded-full bg-watermark/10 px-3 py-1.5 text-caption text-text-secondary">
              Сохранено: {favoriteMedia.length}
            </p>
          ) : undefined
        }
      />

      <LibraryStorageNotice />

      {favoriteMedia.length > 0 && (
        <LibrarySearch
          label="Поиск в избранном"
          query={query}
          visibleCount={visibleFavoriteMedia.length}
          totalCount={favoriteMedia.length}
          onQueryChange={setQuery}
        />
      )}

      {resolution && (
        <LibraryDataNotice
          partial={resolution.partial}
          stale={resolution.stale}
          refreshFailed={hasRefreshError}
          onRetry={retry}
        />
      )}

      {!hasStoredFavorites ? (
        <LibraryEmptyState
          eyebrow="Коллекция ждёт"
          title="Здесь появятся ваши любимые истории"
          description="Добавляйте произведения из каталогов или со страницы просмотра — всё выбранное будет собрано в одном месте."
          icon={<FavoriteIcon className="size-7" />}
          action={
            <Button className="rounded-pill" onClick={() => navigate('/search')}>
              <SearchIcon className="size-4" />
              Найти что посмотреть
            </Button>
          }
        />
      ) : status === 'loading' && favoriteMedia.length === 0 ? (
        <LoadingState label="Загружаем избранное" />
      ) : status === 'error' ? (
        <ErrorState
          title="Не удалось загрузить избранное"
          description="Сохранённые ссылки остались на этом устройстве. Попробуйте загрузить их ещё раз."
          retryLabel="Повторить"
          onRetry={retry}
        />
      ) : visibleFavoriteMedia.length > 0 ? (
        <MediaGrid>
          {visibleFavoriteMedia.map((media) => (
            <MediaCard
              key={media.mediaRef}
              media={media}
              isFavorite={isFavorite(media.mediaRef)}
              onFavoriteChange={() => toggleFavorite(media.mediaRef)}
            />
          ))}
        </MediaGrid>
      ) : favoriteMedia.length > 0 ? (
        <EmptyState
          title="В избранном ничего не найдено"
          description={`По запросу «${query.trim()}» совпадений нет.`}
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Сбросить поиск
            </Button>
          }
          className="min-h-64 rounded-card bg-surface-elevated"
        />
      ) : (
        <LibraryEmptyState
          eyebrow="Коллекция сохранена"
          title="Произведения пока недоступны"
          description="Сохранённые ссылки не потеряны. Попробуйте обновить данные немного позже."
          icon={<FavoriteIcon className="size-7" />}
          action={
            <Button className="rounded-pill" variant="secondary" onClick={retry}>
              Обновить
            </Button>
          }
        />
      )}
    </section>
  );
}
