import { useOpeningHistory } from '@/features/opening-history';
import { EmptyState, ErrorState } from '@/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useMediaDetails } from '../model/useMediaDetails';
import { useMediaAvailability } from '../model/useMediaAvailability';
import { MediaPageSkeleton } from './MediaPageSkeleton';
import { MediaView } from './MediaView';

export function MediaPage() {
  const { mediaRef } = useParams();
  const { recordOpening } = useOpeningHistory();

  const { result, status: detailsStatus, retry: retryDetails } = useMediaDetails(mediaRef);

  const {
    availability,
    isPending: availabilityPending,
    status: availabilityStatus,
  } = useMediaAvailability(mediaRef);

  const media = result?.details ?? null;

  useEffect(() => {
    if (!media) {
      return;
    }

    recordOpening(media.mediaRef);
  }, [media, recordOpening]);

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
    <MediaView
      key={media.mediaRef}
      media={media}
      availability={availability}
      availabilityPending={availabilityPending}
      availabilityStatus={availabilityStatus}
    />
  );
}
