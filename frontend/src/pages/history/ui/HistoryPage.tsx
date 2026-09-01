import { MediaCard, useMediaSummaryResolution, type MediaRef } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { useOpeningHistory } from '@/features/opening-history';
import { Button, ErrorState, HistoryIcon, LoadingState, MediaGrid, SearchIcon } from '@/shared';
import { LibraryDataNotice, LibraryEmptyState, LibraryPageHeader } from '@/widgets/library-page';
import { useNavigate } from 'react-router';

const openingDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const openingTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function formatOpeningDate(openedAt: string) {
  const openedDate = new Date(openedAt);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const openedDayStart = new Date(
    openedDate.getFullYear(),
    openedDate.getMonth(),
    openedDate.getDate(),
  );
  const dayDifference = Math.round(
    (todayStart.getTime() - openedDayStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  const time = openingTimeFormatter.format(openedDate);

  if (dayDifference === 0) {
    return `Сегодня, ${time}`;
  }

  if (dayDifference === 1) {
    return `Вчера, ${time}`;
  }

  return openingDateFormatter.format(openedDate);
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { openingHistoryEntries, clearHistory } = useOpeningHistory();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { resolution, status, retry } = useMediaSummaryResolution(
    openingHistoryEntries.map((entry) => entry.mediaRef),
  );
  const openedAtByMediaRef = new Map(
    openingHistoryEntries.map((entry) => [entry.mediaRef, entry.openedAt]),
  );
  const historyMedia = (resolution?.items ?? []).flatMap((media) => {
    const openedAt = openedAtByMediaRef.get(media.mediaRef);

    return openedAt ? [{ media, openedAt }] : [];
  });
  const hasStoredHistory = openingHistoryEntries.length > 0;

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section>
      <LibraryPageHeader
        eyebrow="Недавняя активность"
        title="История"
        description="Недавно открытые фильмы, сериалы и аниме"
        icon={<HistoryIcon className="size-6" />}
        actions={
          historyMedia.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <p className="rounded-full bg-watermark/10 px-3 py-1.5 text-caption text-text-secondary">
                Открыто: {historyMedia.length}
              </p>
              <Button size="small" variant="secondary" onClick={clearHistory}>
                Очистить
              </Button>
            </div>
          ) : undefined
        }
      />

      {resolution && (
        <LibraryDataNotice partial={resolution.partial} stale={resolution.stale} onRetry={retry} />
      )}

      {!hasStoredHistory ? (
        <LibraryEmptyState
          eyebrow="Первый шаг"
          title="История просмотров начнётся здесь"
          description="Открывайте страницы фильмов, сериалов и аниме — недавние произведения будут сохраняться автоматически."
          icon={<HistoryIcon className="size-7" />}
          action={
            <Button className="rounded-pill" onClick={() => navigate('/search')}>
              <SearchIcon className="size-4" />
              Найти что посмотреть
            </Button>
          }
        />
      ) : status === 'loading' && historyMedia.length === 0 ? (
        <LoadingState label="Загружаем историю" />
      ) : status === 'error' ? (
        <ErrorState
          title="Не удалось загрузить историю"
          description="Локальная история осталась на этом устройстве. Попробуйте загрузить её ещё раз."
          retryLabel="Повторить"
          onRetry={retry}
        />
      ) : historyMedia.length > 0 ? (
        <MediaGrid>
          {historyMedia.map(({ media, openedAt }) => (
            <div key={media.mediaRef} className="min-w-0">
              <MediaCard
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                onOpen={() => openMedia(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />

              <p className="mt-1 text-caption text-text-secondary">{formatOpeningDate(openedAt)}</p>
            </div>
          ))}
        </MediaGrid>
      ) : (
        <LibraryEmptyState
          eyebrow="История сохранена"
          title="Произведения пока недоступны"
          description="Сохранённые ссылки не потеряны. Попробуйте обновить данные немного позже."
          icon={<HistoryIcon className="size-7" />}
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
