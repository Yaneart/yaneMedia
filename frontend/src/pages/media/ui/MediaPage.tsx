import { useOpeningHistory } from '@/features/opening-history';
import { ErrorState, LoadingState } from '@/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useMediaDetails } from '../model/useMediaDetails';
import { useMediaAvailability } from '../model/useMediaAvailability';
import { MediaView } from './MediaView';

export function MediaPage() {
  const { mediaRef } = useParams();
  const { recordOpening } = useOpeningHistory();

  const { result, status: detailsStatus, retry: retryDetails } = useMediaDetails(mediaRef);

  const { availability, status: availabilityStatus } = useMediaAvailability(mediaRef);

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

  if (!media) {
    return <LoadingState variant="page" label="Загружаем произведение" />;
  }

  return (
    <MediaView
      key={`${media.mediaRef}:${availability ? 'ready' : 'pending'}`}
      media={media}
      availability={availability}
      availabilityStatus={availabilityStatus}
    />
  );
}
