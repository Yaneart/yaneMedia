import { MediaCard, useMediaSummaryResolution, type MediaRef } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { Button, ErrorState, FavoriteIcon, LoadingState, MediaGrid, SearchIcon } from '@/shared';
import { LibraryDataNotice, LibraryEmptyState, LibraryPageHeader } from '@/widgets/library-page';
import { useNavigate } from 'react-router';

export function FavoritesPage() {
  const navigate = useNavigate();
  const { favoriteMediaRefs, isFavorite, toggleFavorite } = useFavorites();
  const { resolution, status, retry } = useMediaSummaryResolution(Array.from(favoriteMediaRefs));
  const favoriteMedia =
    resolution?.items.filter((media) => favoriteMediaRefs.has(media.mediaRef)) ?? [];
  const hasStoredFavorites = favoriteMediaRefs.size > 0;

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

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

      {resolution && (
        <LibraryDataNotice partial={resolution.partial} stale={resolution.stale} onRetry={retry} />
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
      ) : favoriteMedia.length > 0 ? (
        <MediaGrid>
          {favoriteMedia.map((media) => (
            <MediaCard
              key={media.mediaRef}
              media={media}
              isFavorite={isFavorite(media.mediaRef)}
              onOpen={() => openMedia(media.mediaRef)}
              onFavoriteChange={() => toggleFavorite(media.mediaRef)}
            />
          ))}
        </MediaGrid>
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
