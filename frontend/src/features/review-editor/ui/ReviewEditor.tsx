import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useBeforeUnload, useBlocker } from 'react-router';

import { useAuth } from '@/entities/auth';
import type { MediaSummary } from '@/entities/media';
import type { PrivateProfile } from '@/entities/profile';
import {
  createReview,
  deleteReview,
  updateReview,
  type OwnReviewDetail,
  type ReviewDraft,
} from '@/entities/review';
import {
  invalidateAfterSocialMutation,
  ownReviewForMediaQueryOptions,
  privateProfileQueryOptions,
  socialQueryKeys,
} from '@/features/social-data';
import {
  describeSocialAccessError,
  SocialLoginLink,
  useRestoreSocialAction,
} from '@/features/social-access';
import { UserRating } from '@/features/user-rating';
import { Button } from '@/shared';
import { ApiClientError } from '@/shared/api';
import {
  countCharacters,
  normalizeReviewDraft,
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_BODY_MIN_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
  reviewDraftsEqual,
  validateReviewDraft,
  type ReviewFormErrors,
} from '../model/reviewForm';

const emptyDraft: ReviewDraft = { title: '', body: '', isSpoiler: false };

function toDraft(review: OwnReviewDetail | null): ReviewDraft {
  return review
    ? { title: review.title, body: review.body, isSpoiler: review.isSpoiler }
    : emptyDraft;
}

function mutationErrorMessage(error: Error): string {
  if (error instanceof ApiClientError && error.code === 'EDIT_CONFLICT')
    return 'Рецензия уже изменилась в другой вкладке. Ваш текст сохранён здесь; обновите данные перед повторной отправкой.';
  if (error instanceof ApiClientError && error.code === 'REVIEW_ALREADY_EXISTS')
    return 'Для этого произведения уже существует ваша рецензия. Обновите редактор, чтобы открыть её.';
  const accessError = describeSocialAccessError(
    error,
    'Не удалось сохранить рецензию. Текст остался в редакторе.',
  );
  return accessError.kind === 'other'
    ? accessError.message
    : `${accessError.message} Текст остался в редакторе.`;
}

function ReviewForm({
  accountKey,
  profile,
  media,
  initialReview,
  onUnauthorized,
}: {
  accountKey: string;
  profile: PrivateProfile;
  media: MediaSummary;
  initialReview: OwnReviewDetail | null;
  onUnauthorized: () => void;
}) {
  const queryClient = useQueryClient();
  const initialDraftRef = useRef(toDraft(initialReview));
  const [draft, setDraft] = useState(initialDraftRef.current);
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [review, setReview] = useState(initialReview);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const isDirty = !reviewDraftsEqual(draft, initialDraftRef.current);
  const blocker = useBlocker(isDirty);

  useRestoreSocialAction('review', () => titleRef.current?.focus());

  useEffect(() => {
    if (!initialReview || initialReview.reviewId === review?.reviewId) return;
    const nextInitialDraft = toDraft(initialReview);
    setReview(initialReview);
    initialDraftRef.current = nextInitialDraft;
    if (!isDirty) setDraft(nextInitialDraft);
  }, [initialReview, isDirty, review?.reviewId]);

  useBeforeUnload(
    (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { capture: true },
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('У вас есть несохранённые изменения. Покинуть страницу и потерять их?')) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  const synchronize = async (nextReview: OwnReviewDetail | null, reviewId?: string) => {
    queryClient.setQueryData(
      socialQueryKeys.ownReviewForMedia(accountKey, media.mediaRef),
      nextReview,
    );
    if (nextReview) {
      queryClient.setQueryData(
        socialQueryKeys.ownReview(accountKey, nextReview.reviewId),
        nextReview,
      );
    } else if (reviewId) {
      queryClient.removeQueries({ queryKey: socialQueryKeys.ownReview(accountKey, reviewId) });
    }
    await invalidateAfterSocialMutation(queryClient, {
      type: 'review',
      reviewId: nextReview?.reviewId ?? reviewId ?? 'deleted-review',
      handle: profile.handle,
      mediaRef: media.mediaRef,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: ReviewDraft) => {
      const normalized = normalizeReviewDraft(nextDraft);
      const detail = review
        ? await updateReview(review.reviewId, {
            ...normalized,
            expectedUpdatedAt: review.updatedAt,
          })
        : await createReview(media.mediaRef, normalized);
      return {
        ...detail,
        body: detail.body ?? normalized.body,
        bodyState: 'visible' as const,
        publicationState: review?.publicationState ?? ('published' as const),
      } satisfies OwnReviewDetail;
    },
    onSuccess: async (nextReview) => {
      const normalized = toDraft(nextReview);
      setReview(nextReview);
      setDraft(normalized);
      initialDraftRef.current = normalized;
      setErrors({});
      setMessage({
        tone: 'success',
        text: review ? 'Изменения сохранены.' : 'Рецензия опубликована.',
      });
      await synchronize(nextReview);
    },
    onError: async (error) => {
      setMessage({ tone: 'error', text: mutationErrorMessage(error) });
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
      if (error instanceof ApiClientError && error.code === 'REVIEW_ALREADY_EXISTS') {
        await queryClient.invalidateQueries({
          queryKey: socialQueryKeys.ownReviewForMedia(accountKey, media.mediaRef),
        });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteReview(review!.reviewId),
    onSuccess: async () => {
      const deletedReviewId = review!.reviewId;
      setReview(null);
      setDraft(emptyDraft);
      initialDraftRef.current = emptyDraft;
      setConfirmingDelete(false);
      setMessage({
        tone: 'success',
        text: 'Рецензия удалена. Ваша оценка произведения сохранена.',
      });
      await synchronize(null, deletedReviewId);
    },
    onError: (error) => {
      setMessage({ tone: 'error', text: mutationErrorMessage(error) });
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateReviewDraft(draft);
    setErrors(nextErrors);
    setMessage(null);
    if (nextErrors.title) titleRef.current?.focus();
    else if (nextErrors.body) bodyRef.current?.focus();
    else saveMutation.mutate(draft);
  };

  const busy = saveMutation.isPending || deleteMutation.isPending;
  const titleCount = countCharacters(draft.title);
  const bodyCount = countCharacters(draft.body);

  return (
    <form onSubmit={submit} noValidate className="mt-5 space-y-5">
      {review && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-control px-4 py-3 text-sm">
          <span className="text-text-secondary">
            {review.publicationState === 'moderation-hidden'
              ? 'Рецензия скрыта модерацией, но её текст доступен вам.'
              : 'Вы редактируете опубликованную рецензию.'}
          </span>
          <Link
            className="font-semibold text-action hover:underline"
            to={`/reviews/${encodeURIComponent(review.reviewId)}`}
          >
            Открыть рецензию
          </Link>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <label htmlFor="review-title" className="text-sm font-medium text-text-primary">
            Заголовок
          </label>
          <span
            className={
              titleCount > REVIEW_TITLE_MAX_LENGTH
                ? 'text-caption text-error'
                : 'text-caption text-text-secondary'
            }
          >
            {titleCount}/{REVIEW_TITLE_MAX_LENGTH}
          </span>
        </div>
        <input
          ref={titleRef}
          id="review-title"
          value={draft.title}
          maxLength={REVIEW_TITLE_MAX_LENGTH + 50}
          disabled={busy}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'review-title-error' : undefined}
          onChange={(event) => {
            setDraft((current) => ({ ...current, title: event.target.value }));
            setErrors((current) => ({ ...current, title: undefined }));
            setMessage(null);
          }}
          className="min-h-11 w-full rounded-control border border-border bg-control px-3 text-sm text-text-primary outline-none transition-colors focus:border-text-secondary focus:ring-2 focus:ring-action/20 disabled:opacity-50"
          placeholder="Коротко сформулируйте главную мысль"
        />
        {errors.title && (
          <p id="review-title-error" className="mt-2 text-caption text-error">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <label htmlFor="review-body" className="text-sm font-medium text-text-primary">
            Текст рецензии
          </label>
          <span
            className={
              bodyCount > REVIEW_BODY_MAX_LENGTH
                ? 'text-caption text-error'
                : 'text-caption text-text-secondary'
            }
          >
            {bodyCount}/{REVIEW_BODY_MAX_LENGTH}
          </span>
        </div>
        <textarea
          ref={bodyRef}
          id="review-body"
          value={draft.body}
          rows={9}
          maxLength={REVIEW_BODY_MAX_LENGTH + 500}
          disabled={busy}
          aria-invalid={Boolean(errors.body)}
          aria-describedby="review-body-hint"
          onChange={(event) => {
            setDraft((current) => ({ ...current, body: event.target.value }));
            setErrors((current) => ({ ...current, body: undefined }));
            setMessage(null);
          }}
          className="w-full resize-y rounded-control border border-border bg-control px-3 py-3 text-sm leading-6 text-text-primary outline-none transition-colors focus:border-text-secondary focus:ring-2 focus:ring-action/20 disabled:opacity-50"
          placeholder="Расскажите, что получилось у авторов и что оставило впечатление"
        />
        <p
          id="review-body-hint"
          className={
            errors.body ? 'mt-2 text-caption text-error' : 'mt-2 text-caption text-text-secondary'
          }
        >
          {errors.body ??
            `От ${REVIEW_BODY_MIN_LENGTH} до ${REVIEW_BODY_MAX_LENGTH} символов. Только обычный текст.`}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-control p-4 has-focus-visible:ring-2 has-focus-visible:ring-action/20">
        <input
          type="checkbox"
          checked={draft.isSpoiler}
          disabled={busy}
          onChange={(event) => {
            setDraft((current) => ({ ...current, isSpoiler: event.target.checked }));
            setMessage(null);
          }}
          className="mt-0.5 size-5 accent-[var(--color-action)]"
        />
        <span>
          <span className="block text-sm font-semibold text-text-primary">
            В тексте есть спойлеры
          </span>
          <span className="mt-1 block text-caption text-text-secondary">
            Читатели увидят предупреждение и раскроют текст только по явному действию.
          </span>
        </span>
      </label>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-sm text-error' : 'text-sm text-success'}
        >
          {message.text}
        </p>
      )}

      {confirmingDelete && review ? (
        <div
          role="alertdialog"
          aria-labelledby="delete-review-title"
          className="rounded-control border border-error/50 bg-error/5 p-4"
        >
          <h3 id="delete-review-title" className="font-semibold text-text-primary">
            Удалить рецензию?
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            Текст и обсуждение перестанут быть доступны. Это действие нельзя отменить, но ваша
            оценка произведения сохранится.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => deleteMutation.mutate()}
              className="border-error/60 text-error"
            >
              Удалить навсегда
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={busy || !isDirty}>
            {saveMutation.isPending
              ? 'Сохраняем…'
              : review
                ? 'Сохранить изменения'
                : 'Опубликовать рецензию'}
          </Button>
          {review && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
              className="text-error"
            >
              Удалить рецензию
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

export function ReviewEditor({ media }: { media: MediaSummary }) {
  const { state: authState, setGuest, refresh } = useAuth();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : null;
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(accountKey ?? 'inactive'),
    enabled: accountKey !== null,
  });
  const reviewQuery = useQuery({
    ...ownReviewForMediaQueryOptions(accountKey ?? 'inactive', media.mediaRef),
    enabled: accountKey !== null,
  });

  return (
    <section
      id="review-editor"
      aria-labelledby="review-editor-heading"
      className="order-5 rounded-card border border-context-border bg-surface-elevated p-5 sm:p-6 xl:col-span-2"
    >
      <h2 id="review-editor-heading" className="text-heading text-text-primary">
        Ваша рецензия
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-text-secondary">
        Поделитесь развёрнутым мнением. У одного пользователя может быть одна рецензия на
        произведение.
      </p>

      <UserRating media={media} embedded className="mt-5" />

      {authState.status === 'guest' ? (
        <p className="mt-5 text-sm text-text-secondary">
          <SocialLoginLink intent="review" className="font-semibold text-action hover:underline">
            Войдите
          </SocialLoginLink>{' '}
          или зарегистрируйтесь, чтобы написать рецензию.
        </p>
      ) : authState.status === 'error' ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-error">
            Не удалось проверить сессию.
          </p>
          <Button variant="secondary" size="small" onClick={() => void refresh()}>
            Повторить
          </Button>
        </div>
      ) : authState.status === 'loading' || profileQuery.isPending || reviewQuery.isPending ? (
        <p className="mt-5 text-sm text-text-secondary" aria-live="polite">
          Загружаем редактор…
        </p>
      ) : profileQuery.isError || reviewQuery.isError || !profileQuery.data ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-error">
            Не удалось загрузить вашу рецензию.
          </p>
          <Button
            variant="secondary"
            size="small"
            onClick={() => void Promise.all([profileQuery.refetch(), reviewQuery.refetch()])}
          >
            Повторить
          </Button>
        </div>
      ) : !profileQuery.data.emailVerified ? (
        <p className="mt-5 text-sm text-text-secondary">
          Подтвердите email в профиле, чтобы публиковать рецензии.
        </p>
      ) : (
        <ReviewForm
          accountKey={accountKey!}
          profile={profileQuery.data}
          media={media}
          initialReview={reviewQuery.data ?? null}
          onUnauthorized={setGuest}
        />
      )}
    </section>
  );
}
