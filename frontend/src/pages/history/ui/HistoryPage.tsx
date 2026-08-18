import { demoMediaCatalog, MediaCard, type MediaRef } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { useOpeningHistory } from '@/features/opening-history';
import { Button, EmptyState, MediaGrid } from '@/shared';
import { useNavigate } from 'react-router';

const openingDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function HistoryPage() {
  const navigate = useNavigate();
  const { openingHistoryEntries, clearHistory } = useOpeningHistory();
  const { isFavorite, toggleFavorite } = useFavorites();

  const historyMedia = openingHistoryEntries.flatMap((entry) => {
    const media = demoMediaCatalog.find((item) => item.mediaRef === entry.mediaRef);

    return media
      ? [
          {
            media,
            openedAt: entry.openedAt,
          },
        ]
      : [];
  });

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section>
      <div
        className={[
          'mb-6 flex flex-col gap-4',
          'sm:flex-row sm:items-start sm:justify-between',
        ].join(' ')}
      >
        <div>
          <h1 className="text-title text-text-primary">История</h1>
          <p className="mt-2 text-body text-text-secondary">
            Недавно открытые фильмы, сериалы и аниме
          </p>
        </div>

        {openingHistoryEntries.length > 0 && (
          <Button
            size="small"
            variant="ghost"
            className="shrink-0 self-start"
            onClick={clearHistory}
          >
            Очистить историю
          </Button>
        )}
      </div>

      {historyMedia.length > 0 ? (
        <MediaGrid>
          {historyMedia.map(({ media, openedAt }) => (
            <div key={media.mediaRef} className="min-w-0">
              <MediaCard
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                onOpen={() => openMedia(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />

              <p className="mt-1 text-caption text-text-secondary">
                Открыто {openingDateFormatter.format(new Date(openedAt))}
              </p>
            </div>
          ))}
        </MediaGrid>
      ) : (
        <EmptyState
          title="История пока пуста"
          description="Открывайте страницы произведений — они появятся здесь."
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
