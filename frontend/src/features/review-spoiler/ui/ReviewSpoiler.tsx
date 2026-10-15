import { useEffect, useRef, useState } from 'react';

import { getReviewContent } from '@/entities/review';
import { Button } from '@/shared';
import { createSpoilerExcerpt } from '../model/reviewSpoiler';

type ReviewSpoilerProps = {
  reviewId: string;
  content: string | null;
  hidden: boolean;
  variant: 'summary' | 'detail';
};

type SpoilerState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'visible'; content: string }
  | { status: 'error' };

export function ReviewSpoiler({ reviewId, content, hidden, variant }: ReviewSpoilerProps) {
  const [state, setState] = useState<SpoilerState>(() =>
    hidden ? { status: 'hidden' } : { status: 'visible', content: content ?? '' },
  );
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    setState(hidden ? { status: 'hidden' } : { status: 'visible', content: content ?? '' });
    return () => requestRef.current?.abort();
  }, [content, hidden, reviewId]);

  const reveal = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: 'loading' });

    try {
      const body = await getReviewContent(reviewId, controller.signal);
      setState({
        status: 'visible',
        content: variant === 'summary' ? createSpoilerExcerpt(body) : body,
      });
    } catch {
      if (!controller.signal.aborted) setState({ status: 'error' });
    }
  };

  if (state.status === 'visible') {
    if (!state.content) return null;
    return variant === 'summary' ? (
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
        {state.content}
      </p>
    ) : (
      <div className="whitespace-pre-wrap text-body leading-8 text-text-primary">
        {state.content}
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'summary'
          ? 'mt-3 rounded-control border border-context-border bg-control px-4 py-3'
          : 'rounded-card border border-context-border bg-surface-elevated/65 px-5 py-6 sm:px-8'
      }
    >
      <p className="font-semibold text-text-primary">
        {variant === 'summary' ? 'Текст содержит спойлеры' : 'Рецензия содержит спойлеры'}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-text-secondary">
        {variant === 'summary'
          ? 'Откройте его только если готовы узнать детали сюжета.'
          : 'Текст появится только после подтверждения. Выбор действует в текущем просмотре.'}
      </p>
      <Button
        variant={variant === 'summary' ? 'ghost' : 'secondary'}
        size={variant === 'summary' ? 'small' : 'medium'}
        className={variant === 'summary' ? 'mt-2 -ml-3 text-accent-text' : 'mt-4'}
        disabled={state.status === 'loading'}
        onClick={() => void reveal()}
      >
        {state.status === 'loading'
          ? 'Открываем…'
          : state.status === 'error'
            ? 'Попробовать снова'
            : variant === 'summary'
              ? 'Показать текст'
              : 'Показать рецензию'}
      </Button>
      {state.status === 'error' && (
        <p role="status" className="mt-2 text-caption text-danger">
          Не удалось открыть текст. Остальная страница доступна.
        </p>
      )}
    </div>
  );
}
