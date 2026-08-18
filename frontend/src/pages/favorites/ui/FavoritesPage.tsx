import { demoMediaCatalog, MediaCard, type MediaRef } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { Button, EmptyState, MediaGrid } from '@/shared';
import { useNavigate } from 'react-router';

export function FavoritesPage() {
  const navigate = useNavigate();
  const { favoriteMediaRefs, isFavorite, toggleFavorite } = useFavorites();

  const favoriteMedia = demoMediaCatalog.filter((media) => favoriteMediaRefs.has(media.mediaRef));

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-title text-text-primary">Избранное</h1>
        <p className="mt-2 text-body text-text-secondary">Сохранённые фильмы, сериалы и аниме</p>
      </div>

      {favoriteMedia.length > 0 ? (
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
        <EmptyState
          title="В избранном пока ничего нет"
          description="Добавляйте произведения из каталогов или со страницы просмотра — они появятся здесь."
          action={
            <Button variant="secondary" onClick={() => navigate('/movies')}>
              Перейти к фильмам
            </Button>
          }
          className="min-h-80 rounded-card border border-context-border bg-surface-elevated"
        />
      )}
    </section>
  );
}
