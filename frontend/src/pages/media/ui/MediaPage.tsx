import { useOpeningHistory } from '@/features/opening-history';
import { resolveMediaDetailsPresentation } from '@/entities/media';
import { EmptyState, ErrorState, MediaPageSkeleton } from '@/shared';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { useMediaDetails } from '../model/useMediaDetails';
import { useMediaSummary } from '../model/useMediaSummary';
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
  const { mediaRef } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { recordOpening } = useOpeningHistory();

  const { result, status: detailsStatus, retry: retryDetails } = useMediaDetails(mediaRef);
  const { summary, status: summaryStatus } = useMediaSummary(mediaRef);

  const {
    availability,
    isPending: availabilityPending,
    status: availabilityStatus,
  } = useMediaAvailability(mediaRef);

  const media = useMemo(
    () => resolveMediaDetailsPresentation(summary, result?.details ?? null),
    [result?.details, summary],
  );
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

  if (detailsStatus === 'not-found' && summaryStatus === 'not-found') {
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

  if (
    !media &&
    (detailsStatus === 'error' || summaryStatus === 'error') &&
    detailsStatus !== 'loading' &&
    summaryStatus !== 'loading'
  ) {
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

  if (
    !media &&
    (detailsStatus === 'offline' || summaryStatus === 'offline') &&
    detailsStatus !== 'loading' &&
    summaryStatus !== 'loading'
  ) {
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
      <MediaView
        key={media.mediaRef}
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
