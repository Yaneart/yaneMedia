import { MediaCard, useMediaSummaryResolution } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { useOpeningHistory } from '@/features/opening-history';
import {
  Button,
  DeleteIcon,
  EmptyState,
  ErrorState,
  HistoryIcon,
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
  const [query, setQuery] = useState('');
  const [removalAnnouncement, setRemovalAnnouncement] = useState('');
  const navigate = useNavigate();
  const {
    openingHistoryEntries,
    canUndoClearHistory,
    removeOpening,
    clearHistory,
    undoClearHistory,
  } = useOpeningHistory();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { resolution, status, hasRefreshError, retry } = useMediaSummaryResolution(
    openingHistoryEntries.map((entry) => entry.mediaRef),
  );
  const openedAtByMediaRef = new Map(
    openingHistoryEntries.map((entry) => [entry.mediaRef, entry.openedAt]),
  );
  const historyMedia = (resolution?.items ?? []).flatMap((media) => {
    const openedAt = openedAtByMediaRef.get(media.mediaRef);

    return openedAt ? [{ media, openedAt }] : [];
  });
  const visibleHistoryMedia = historyMedia.filter(({ media }) => matchesLibraryQuery(media, query));
  const hasStoredHistory = openingHistoryEntries.length > 0;

  const handleRemoveOpening = (mediaRef: string, title: string) => {
    removeOpening(mediaRef);
    setRemovalAnnouncement(`«${title}» удалено из истории.`);
  };

  return (
    <section>
      <LibraryPageHeader
        eyebrow="Недавняя активность"
        title="История"
        description="Недавно открытые фильмы, сериалы и аниме"
        icon={<HistoryIcon className="size-6" />}
        actions={
          hasStoredHistory ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <p className="rounded-full bg-watermark/10 px-3 py-1.5 text-caption text-text-secondary">
                Открыто: {openingHistoryEntries.length}
              </p>
              <Button size="small" variant="secondary" onClick={clearHistory}>
                Очистить
              </Button>
            </div>
          ) : undefined
        }
      />

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {removalAnnouncement}
      </p>

      <LibraryStorageNotice />

      {canUndoClearHistory && (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">История очищена.</p>
          <Button size="small" variant="secondary" onClick={undoClearHistory}>
            Отменить
          </Button>
        </div>
      )}

      {historyMedia.length > 0 && (
        <LibrarySearch
          label="Поиск в истории"
          query={query}
          visibleCount={visibleHistoryMedia.length}
          totalCount={historyMedia.length}
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
      ) : visibleHistoryMedia.length > 0 ? (
        <MediaGrid>
          {visibleHistoryMedia.map(({ media, openedAt }) => (
            <div key={media.mediaRef} className="min-w-0">
              <MediaCard
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />

              <div className="mt-1 flex min-h-9 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-caption text-text-secondary">
                  {formatOpeningDate(openedAt)}
                </p>
                <Button
                  size="small"
                  variant="ghost"
                  className="min-h-8 shrink-0 px-2 text-text-secondary"
                  aria-label={`Удалить «${media.title}» из истории`}
                  onClick={() => handleRemoveOpening(media.mediaRef, media.title)}
                >
                  <DeleteIcon aria-hidden="true" className="size-4" />
                  <span className="hidden sm:inline">Удалить</span>
                </Button>
              </div>
            </div>
          ))}
        </MediaGrid>
      ) : historyMedia.length > 0 ? (
        <EmptyState
          title="В истории ничего не найдено"
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
