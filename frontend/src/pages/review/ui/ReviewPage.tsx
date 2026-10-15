import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { createPublicProfilePath } from '@/app/router/routes';
import { useAuth } from '@/entities/auth';
import { MediaLink, MediaPosterFallback } from '@/entities/media';
import { createReport, type ReportReason } from '@/entities/moderation';
import {
  deleteReview,
  getReviewContent,
  isReviewId,
  type ReviewAuthor,
  type ReviewDetail,
} from '@/entities/review';
import {
  invalidateAfterSocialMutation,
  reviewQueryOptions,
  type SocialViewer,
} from '@/features/social-data';
import { ReviewDiscussion } from '@/features/review-discussion';
import {
  Button,
  CommentIcon,
  DeleteIcon,
  ErrorState,
  ProfileIcon,
  ShieldIcon,
  SocialNotFoundState,
  SocialPageSkeleton,
  StarIcon,
} from '@/shared';
import { ApiClientError } from '@/shared/api';
import {
  formatReviewCommentCount,
  formatReviewPageDate,
  wasReviewEdited,
} from '../model/reviewPagePresentation';

const reportReasons: readonly { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбления или травля' },
  { value: 'hate', label: 'Язык ненависти' },
  { value: 'sexual_content', label: 'Сексуальный контент' },
  { value: 'violence', label: 'Жестокий контент' },
  { value: 'spoiler', label: 'Неотмеченный спойлер' },
  { value: 'other', label: 'Другое' },
];

function mediaPath(review: ReviewDetail): string {
  return `/media/${encodeURIComponent(review.media.slug)}`;
}

function ReviewAuthorLink({ author }: { author: ReviewAuthor }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = author.state === 'active' ? author.user.avatarUrl : null;

  useEffect(() => setAvatarFailed(false), [avatarUrl]);

  const avatar =
    avatarUrl && !avatarFailed ? (
      <img
        src={avatarUrl}
        alt=""
        className="size-11 rounded-full bg-control object-cover"
        onError={() => setAvatarFailed(true)}
      />
    ) : (
      <span className="grid size-11 place-items-center rounded-full bg-watermark/10 text-sm font-semibold text-accent-text">
        {author.state === 'active' ? (
          (Array.from(author.user.displayName.trim() || author.user.handle)[0]?.toUpperCase() ??
          '?')
        ) : (
          <ProfileIcon className="size-5 text-text-secondary" aria-hidden="true" />
        )}
      </span>
    );

  if (author.state === 'deleted') {
    return (
      <span className="inline-flex min-w-0 items-center gap-3">
        {avatar}
        <span className="font-semibold text-text-primary">{author.label}</span>
      </span>
    );
  }

  return (
    <Link
      to={createPublicProfilePath(author.user.handle)}
      className="inline-flex min-w-0 items-center gap-3 rounded-control outline-none hover:text-accent-text focus-visible:ring-2 focus-visible:ring-action/20"
    >
      {avatar}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-text-primary hover:underline">
          {author.user.displayName}
        </span>
        <span className="block truncate text-caption text-text-secondary">
          @{author.user.handle}
        </span>
      </span>
    </Link>
  );
}

function SpoilerBody({ review }: { review: ReviewDetail }) {
  const [state, setState] = useState<
    | { status: 'hidden' }
    | { status: 'loading' }
    | { status: 'visible'; body: string }
    | { status: 'error' }
  >(
    review.bodyState === 'visible'
      ? { status: 'visible', body: review.body ?? '' }
      : { status: 'hidden' },
  );
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  if (state.status === 'visible') {
    return (
      <div className="whitespace-pre-wrap text-body leading-8 text-text-primary">{state.body}</div>
    );
  }

  const reveal = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: 'loading' });
    try {
      setState({
        status: 'visible',
        body: await getReviewContent(review.reviewId, controller.signal),
      });
    } catch {
      if (!controller.signal.aborted) setState({ status: 'error' });
    }
  };

  return (
    <div className="rounded-card border border-context-border bg-control px-5 py-6 sm:px-8">
      <p className="font-semibold text-text-primary">Рецензия содержит спойлеры</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
        Текст скрыт, пока вы явно не решите его открыть. Выбор действует только для текущего
        просмотра.
      </p>
      <Button
        className="mt-4"
        variant="secondary"
        disabled={state.status === 'loading'}
        onClick={() => void reveal()}
      >
        {state.status === 'loading'
          ? 'Открываем…'
          : state.status === 'error'
            ? 'Попробовать снова'
            : 'Показать рецензию'}
      </Button>
      {state.status === 'error' && (
        <p role="status" className="mt-3 text-sm text-error">
          Не удалось открыть текст. Остальная страница продолжает работать.
        </p>
      )}
    </div>
  );
}

function ReportReview({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createReport({ type: 'review', reviewId }, reason, note.trim() || undefined),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedNote = note.trim();
    if (reason === 'other' && !normalizedNote) {
      setValidationError('Для причины «Другое» добавьте пояснение.');
      return;
    }
    if (Array.from(normalizedNote).length > 1000 || /[<>]/u.test(normalizedNote)) {
      setValidationError('Пояснение: до 1000 символов обычного текста без угловых скобок.');
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  if (mutation.isSuccess) {
    return (
      <p role="status" className="text-sm font-medium text-success">
        Жалоба отправлена на рассмотрение.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="small" onClick={() => setOpen(true)}>
        <ShieldIcon className="size-4" aria-hidden="true" />
        Пожаловаться
      </Button>
    );
  }

  const errorMessage =
    mutation.error instanceof ApiClientError && mutation.error.code === 'REPORT_ALREADY_EXISTS'
      ? 'Вы уже отправили активную жалобу на эту рецензию.'
      : mutation.error instanceof ApiClientError &&
          mutation.error.code === 'EMAIL_VERIFICATION_REQUIRED'
        ? 'Подтвердите email перед отправкой жалобы.'
        : mutation.isError
          ? 'Не удалось отправить жалобу. Попробуйте снова.'
          : null;

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-control border border-border bg-control p-4 sm:max-w-xl"
    >
      <label htmlFor="review-report-reason" className="text-sm font-semibold text-text-primary">
        Причина жалобы
      </label>
      <select
        id="review-report-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value as ReportReason)}
        className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      >
        {reportReasons.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label
        htmlFor="review-report-note"
        className="mt-4 block text-sm font-semibold text-text-primary"
      >
        Пояснение {reason === 'other' ? '(обязательно)' : '(необязательно)'}
      </label>
      <textarea
        id="review-report-note"
        value={note}
        rows={4}
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      />
      {(validationError || errorMessage) && (
        <p role="alert" className="mt-2 text-sm text-error">
          {validationError ?? errorMessage}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="small" disabled={mutation.isPending}>
          {mutation.isPending ? 'Отправляем…' : 'Отправить'}
        </Button>
        <Button
          variant="ghost"
          size="small"
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

function ReviewActions({ review }: { review: ReviewDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteReview(review.reviewId),
    onSuccess: async () => {
      void navigate(`${mediaPath(review)}#review-editor`, { replace: true });
      await invalidateAfterSocialMutation(queryClient, {
        type: 'review',
        reviewId: review.reviewId,
        mediaRef: review.media.mediaRef,
        ...(review.author.state === 'active' ? { handle: review.author.user.handle } : {}),
      });
    },
  });

  if (
    !review.viewerActions.canEdit &&
    !review.viewerActions.canDelete &&
    !review.viewerActions.canReport
  ) {
    return null;
  }

  return (
    <div className="mt-8 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-2">
        {review.viewerActions.canEdit && (
          <Link
            to={`${mediaPath(review)}#review-editor`}
            className="inline-flex min-h-9 items-center rounded-control border border-border bg-control px-3 text-sm font-semibold text-text-primary hover:border-text-secondary hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
          >
            Редактировать
          </Link>
        )}
        {review.viewerActions.canDelete && (
          <Button
            variant="ghost"
            size="small"
            className="text-error"
            onClick={() => setConfirmingDelete(true)}
          >
            <DeleteIcon className="size-4" aria-hidden="true" />
            Удалить
          </Button>
        )}
        {review.viewerActions.canReport && <ReportReview reviewId={review.reviewId} />}
      </div>

      {confirmingDelete && (
        <div
          role="alertdialog"
          aria-labelledby="review-delete-title"
          className="mt-4 rounded-control border border-error/40 bg-error/5 p-4"
        >
          <p id="review-delete-title" className="font-semibold text-text-primary">
            Удалить рецензию?
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Рецензию и её обсуждение нельзя будет восстановить. Ваша оценка произведения сохранится.
          </p>
          {deleteMutation.isError && (
            <p role="alert" className="mt-2 text-sm text-error">
              Не удалось удалить рецензию. Попробуйте снова.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="small"
              className="bg-error text-white"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Удаляем…' : 'Удалить навсегда'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewContent({ review }: { review: ReviewDetail }) {
  const edited = wasReviewEdited(review.createdAt, review.updatedAt);
  const poster = review.media.poster;

  return (
    <>
      <title>{review.title} — yaneMedia</title>
      <article className="mx-auto max-w-5xl py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-8">
          <div className="min-w-0 rounded-card border border-border bg-surface p-5 sm:p-8">
            <MediaLink
              mediaRef={review.media.mediaRef}
              summary={review.media}
              className="text-caption font-semibold tracking-wider text-accent-text uppercase hover:underline"
            >
              Рецензия на «{review.media.title}»
            </MediaLink>
            <h1
              data-page-heading
              tabIndex={-1}
              className="mt-3 text-3xl leading-tight font-semibold text-text-primary sm:text-4xl"
            >
              {review.title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-4">
              <ReviewAuthorLink author={review.author} />
              {review.rating !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-watermark/10 px-3 py-1.5 text-sm font-semibold text-text-primary">
                  <StarIcon className="size-4 text-watermark" aria-hidden="true" />
                  {review.rating}/10
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
              <span>
                Опубликовано{' '}
                <time dateTime={review.createdAt}>{formatReviewPageDate(review.createdAt)}</time>
              </span>
              {edited && (
                <span>
                  Изменено{' '}
                  <time dateTime={review.updatedAt}>{formatReviewPageDate(review.updatedAt)}</time>
                </span>
              )}
            </div>

            <div className="mt-8">
              <SpoilerBody review={review} />
            </div>
            <ReviewActions review={review} />
          </div>

          <aside className="self-start rounded-card border border-border bg-surface-elevated p-4 lg:sticky lg:top-6">
            <MediaLink
              mediaRef={review.media.mediaRef}
              summary={review.media}
              className="group block"
            >
              <div className="mx-auto aspect-2/3 max-w-48 overflow-hidden rounded-control border border-context-border bg-elevated lg:max-w-none">
                {poster ? (
                  <img
                    src={poster.url}
                    alt=""
                    width={poster.width}
                    height={poster.height}
                    className="size-full object-cover"
                  />
                ) : (
                  <MediaPosterFallback
                    mediaRef={review.media.mediaRef}
                    title={review.media.title}
                    type={review.media.type}
                  />
                )}
              </div>
              <span className="mt-3 block font-semibold text-text-primary group-hover:text-accent-text group-hover:underline">
                {review.media.title}
              </span>
              {(review.media.year || review.media.genres.length > 0) && (
                <span className="mt-1 block text-caption text-text-secondary">
                  {[review.media.year, review.media.genres.slice(0, 2).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </MediaLink>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-text-secondary">
              <CommentIcon className="size-4" aria-hidden="true" />
              {formatReviewCommentCount(review.commentCount)}
            </div>
          </aside>
        </div>
        <ReviewDiscussion review={review} />
      </article>
    </>
  );
}

export function ReviewPage() {
  const reviewId = useParams().reviewId ?? '';
  const hasValidReviewId = isReviewId(reviewId);
  const { state } = useAuth();
  const viewer: SocialViewer =
    state.status === 'authenticated' ? { accountKey: state.user.email } : 'guest';
  const query = useQuery({
    ...reviewQueryOptions(reviewId, viewer),
    enabled: hasValidReviewId && state.status !== 'loading',
  });

  if (!hasValidReviewId) return <SocialNotFoundState kind="review" />;
  if (state.status === 'loading' || query.isPending) return <SocialPageSkeleton variant="review" />;
  if (query.error instanceof ApiClientError && query.error.status === 404) {
    return <SocialNotFoundState kind="review" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        variant="page"
        title="Не удалось загрузить рецензию"
        description="Проверьте соединение и попробуйте ещё раз."
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    );
  }

  return <ReviewContent key={query.data.reviewId} review={query.data} />;
}
