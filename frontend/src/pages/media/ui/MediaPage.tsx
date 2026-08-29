import { useOpeningHistory } from '@/features/opening-history';
import { ErrorState, Spinner } from '@/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useMediaDetails } from '../model/useMediaDetails';
import { MediaView } from './MediaView';

export function MediaPage() {
  const { mediaRef } = useParams();
  const { result, status, retry } = useMediaDetails(mediaRef);
  const { recordOpening } = useOpeningHistory();

  const media = result?.details ?? null;

  useEffect(() => {
    if (!media) {
      return;
    }

    recordOpening(media.mediaRef);
  }, [media, recordOpening]);

  if (status === 'not-found') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <ErrorState
          title="Произведение не найдено"
          description="Проверьте ссылку или вернитесь в каталог."
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <ErrorState
          title="Не удалось загрузить произведение"
          description="Проверьте подключение и попробуйте ещё раз."
          onRetry={retry}
        />
      </div>
    );
  }

  if (!media) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="large" label="Загружаем информацию о произведении" />
      </div>
    );
  }

  return <MediaView key={media.mediaRef} media={media} />;
}
