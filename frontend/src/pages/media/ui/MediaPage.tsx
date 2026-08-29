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

  if (status === 'error') {
    return (
      <ErrorState
        variant="page"
        eyebrow="Связь прервана"
        title="Не удалось загрузить произведение"
        description="Медиатека временно не отвечает. Проверьте подключение и попробуйте восстановить сигнал."
        visualCode="!"
        visualLabel="Сигнал потерян"
        retryLabel="Восстановить сигнал"
        onRetry={retry}
      />
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
