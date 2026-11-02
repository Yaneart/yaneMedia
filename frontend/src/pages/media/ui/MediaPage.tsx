import { useOpeningHistory } from '@/features/opening-history';
import { useAuth } from '@/entities/auth';
import { Button, EmptyState, ErrorState, MediaPageSkeleton } from '@/shared';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { useMediaDetails } from '../model/useMediaDetails';
import { useMediaAvailability } from '../model/useMediaAvailability';
import { MediaView } from './MediaView';
import {
  getAnimeEpisodeNavigationTarget,
  getAnimeSeasonNavigationTarget,
} from '../model/animeSeasonNavigation';

function parseEpisodeNumber(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;

  const episodeNumber = Number(value);
  return Number.isSafeInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : undefined;
}

export function MediaPage() {
  const { state: authState } = useAuth();
  const ownerKey = authState.status === 'authenticated' ? authState.user.email : authState.status;
  const { mediaRef } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { recordOpening } = useOpeningHistory();

  const {
    result,
    status: detailsStatus,
    retry: retryDetails,
    isUpdating,
    hasRefreshError,
  } = useMediaDetails(mediaRef);
  const media = result?.details ?? null;

  const {
    availability,
    isPending: availabilityPending,
    status: availabilityStatus,
  } = useMediaAvailability(mediaRef);
  const openingMediaRef = media?.mediaRef;

  useEffect(() => {
    const canonicalSlug = result?.details.slug;
    if (!mediaRef || !canonicalSlug || mediaRef === canonicalSlug) return;
    navigate(`/media/${encodeURIComponent(canonicalSlug)}`, { replace: true });
  }, [mediaRef, navigate, result?.details.slug]);

  useEffect(() => {
    if (!openingMediaRef) return;

    recordOpening(openingMediaRef);
  }, [openingMediaRef, recordOpening]);

  if (detailsStatus === 'not-found') {
    return (
      <ErrorState
        variant="page"
        eyebrow="Вне каталога"
        title="Произведение не найдено"
        description="Возможно, ссылка устарела или этого произведения ещё нет в медиатеке."
        visualCode="404"
        visualLabel="Нет в каталоге"
        tone="accent"
      />
    );
  }

  if (detailsStatus === 'error') {
    return (
      <ErrorState
        variant="page"
        eyebrow="Связь прервана"
        title="Не удалось загрузить произведение"
        description="Медиатека временно не отвечает. Проверьте подключение и попробуйте восстановить сигнал."
        visualCode="!"
        visualLabel="Сигнал потерян"
        retryLabel="Восстановить сигнал"
        onRetry={retryDetails}
      />
    );
  }

  if (detailsStatus === 'offline') {
    return (
      <EmptyState
        title="Нет подключения к сети"
        description="Загрузим информацию о произведении, когда соединение восстановится."
        className="min-h-[60vh]"
      />
    );
  }

  if (!media) {
    return <MediaPageSkeleton />;
  }

  return (
    <div>
      {(result?.degraded || hasRefreshError) && (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">
            {hasRefreshError
              ? 'Не удалось обновить информацию о произведении. Показаны сохранённые данные.'
              : 'Информация о произведении может быть неполной. Обновим её автоматически.'}
          </p>
          <Button size="small" variant="ghost" disabled={isUpdating} onClick={retryDetails}>
            Обновить
          </Button>
        </div>
      )}
      <MediaView
        key={`${media.mediaRef}:${ownerKey}`}
        media={media}
        animeSeasonChain={result?.animeSeasonChain ?? []}
        initialAnimeEpisodeNumber={parseEpisodeNumber(searchParams.get('episode'))}
        onAnimeSeasonChange={(seasonNumber) => {
          const target = getAnimeSeasonNavigationTarget(
            result?.animeSeasonChain ?? [],
            seasonNumber,
            media.mediaRef,
          );

          if (target) navigate(`/media/${encodeURIComponent(target)}`);
        }}
        onAnimeEpisodeChange={(seasonNumber, episodeNumber) => {
          const target = getAnimeEpisodeNavigationTarget(
            result?.animeSeasonChain ?? [],
            seasonNumber,
            episodeNumber,
            media.mediaRef,
          );

          if (target) {
            navigate(`/media/${encodeURIComponent(target)}?episode=${episodeNumber}`);
          }
        }}
        availability={availability}
        availabilityPending={availabilityPending}
        availabilityStatus={availabilityStatus}
      />
    </div>
  );
}
