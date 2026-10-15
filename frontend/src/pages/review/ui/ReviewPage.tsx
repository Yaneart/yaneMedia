import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { createPublicProfilePath } from '@/app/router/routes';
import { useAuth } from '@/entities/auth';
import { MediaLink, MediaPosterFallback } from '@/entities/media';
import {
  deleteReview,
  isReviewId,
  type ReviewAuthor,
  type ReviewDetail,
  type OwnReviewDetail,
} from '@/entities/review';
import { ContentReportForm } from '@/features/content-report';
import { ContentModerationForm } from '@/features/content-moderation';
import { ReviewSpoiler } from '@/features/review-spoiler';
import {
  invalidateAfterSocialMutation,
  ownReviewQueryOptions,
  privateProfileQueryOptions,
  removeReviewFromSocialCache,
  reviewQueryOptions,
  socialQueryKeys,
  type SocialViewer,
} from '@/features/social-data';
import {
  describeSocialAccessError,
  SocialLoginLink,
  useRestoreSocialAction,
} from '@/features/social-access';
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
  YaneMark,
} from '@/shared';
import { ApiClientError } from '@/shared/api';
import {
  formatReviewCommentCount,
  formatReviewPageDate,
  wasReviewEdited,
} from '../model/reviewPagePresentation';

type DisplayReview = ReviewDetail | OwnReviewDetail;

const reviewActionClassName =
  'inline-flex min-h-9 items-center gap-2 rounded-control border border-border bg-surface-elevated/70 px-3 text-sm font-semibold shadow-sm transition-[background-color,border-color,box-shadow] hover:border-watermark/50 hover:bg-watermark/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 motion-reduce:transition-none';

const reviewWatermarks = [
  '-left-10 top-12 size-48 rotate-[18deg] opacity-[0.24]',
  'left-[34%] -top-12 size-56 -rotate-[18deg] opacity-[0.2]',
  'right-[8%] top-24 size-32 rotate-[35deg] opacity-[0.2]',
  '-right-12 top-[32rem] size-56 -rotate-[20deg] opacity-[0.24]',
  'left-[18%] top-[44rem] size-32 rotate-[142deg] opacity-[0.17]',
  'left-[61%] top-[60rem] size-48 rotate-[24deg] opacity-[0.2]',
];

function mediaPath(review: DisplayReview): string {
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

function ReportReview({ reviewId }: { reviewId: string }) {
  const { setGuest } = useAuth();
  const [open, setOpen] = useState(false);

  useRestoreSocialAction('report', () => setOpen(true));

  if (!open) {
    return (
      <Button variant="ghost" size="small" onClick={() => setOpen(true)}>
        <ShieldIcon className="size-4" aria-hidden="true" />
        Пожаловаться
      </Button>
    );
  }

  return (
    <div className="w-full sm:max-w-xl">
      <ContentReportForm
        target={{ type: 'review', reviewId }}
        onCancel={() => setOpen(false)}
        onUnauthorized={setGuest}
      />
    </div>
  );
}

function ReviewActions({ review }: { review: DisplayReview }) {
  const { state: authState, setGuest, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moderating, setModerating] = useState(false);
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(
      authState.status === 'authenticated' ? authState.user.email : 'inactive',
    ),
    enabled: authState.status === 'authenticated',
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteReview(review.reviewId),
    onSuccess: async () => {
      removeReviewFromSocialCache(queryClient, review.reviewId);
      if (authState.status === 'authenticated') {
        queryClient.removeQueries({
          queryKey: socialQueryKeys.ownReviewForMedia(authState.user.email, review.media.mediaRef),
        });
      }
      void navigate(`${mediaPath(review)}#review-editor`, { replace: true });
      await invalidateAfterSocialMutation(queryClient, {
        type: 'review',
        reviewId: review.reviewId,
        mediaRef: review.media.mediaRef,
        ...(review.author.state === 'active' ? { handle: review.author.user.handle } : {}),
      });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) setGuest();
    },
  });

  if (
    authState.status === 'authenticated' &&
    !review.viewerActions.canEdit &&
    !review.viewerActions.canDelete &&
    !review.viewerActions.canReport &&
    !review.viewerActions.canModerate &&
    profileQuery.data?.emailVerified !== false &&
    !profileQuery.isError
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
            variant="bare"
            size="small"
            className={`${reviewActionClassName} text-error hover:text-error`}
            onClick={() => setConfirmingDelete(true)}
          >
            <DeleteIcon className="size-4" aria-hidden="true" />
            Удалить
          </Button>
        )}
        {review.viewerActions.canReport && <ReportReview reviewId={review.reviewId} />}
        {review.viewerActions.canModerate &&
          !('publicationState' in review && review.publicationState === 'moderation-hidden') && (
            <Button
              variant="bare"
              size="small"
              className={`${reviewActionClassName} text-error hover:text-error`}
              onClick={() => setModerating(true)}
            >
              <ShieldIcon className="size-4" aria-hidden="true" />
              Скрыть как модератор
            </Button>
          )}
        {authState.status === 'guest' && (
          <SocialLoginLink
            intent="report"
            className="inline-flex min-h-9 items-center gap-2 rounded-control px-3 text-sm font-semibold text-text-secondary hover:bg-interactive-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
          >
            <ShieldIcon className="size-4" aria-hidden="true" />
            Войти, чтобы пожаловаться
          </SocialLoginLink>
        )}
        {authState.status === 'error' && (
          <Button variant="secondary" size="small" onClick={() => void refresh()}>
            Повторить проверку сессии
          </Button>
        )}
        {authState.status === 'authenticated' &&
          !review.viewerActions.canEdit &&
          !review.viewerActions.canDelete &&
          !review.viewerActions.canReport &&
          profileQuery.data?.emailVerified === false && (
            <p className="text-sm text-text-secondary">
              Подтвердите email, чтобы отправлять жалобы.
            </p>
          )}
        {authState.status === 'authenticated' && profileQuery.isError && (
          <Button variant="secondary" size="small" onClick={() => void profileQuery.refetch()}>
            Повторить проверку доступа
          </Button>
        )}
      </div>

      {moderating && (
        <div className="mt-4 max-w-xl">
          <ContentModerationForm
            target={{ type: 'review', reviewId: review.reviewId }}
            onCancel={() => setModerating(false)}
            onSuccess={() => {
              removeReviewFromSocialCache(queryClient, review.reviewId);
              void invalidateAfterSocialMutation(queryClient, {
                type: 'moderation',
                targetId: review.reviewId,
              });
              void navigate(mediaPath(review), { replace: true });
            }}
          />
        </div>
      )}

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
              {
                describeSocialAccessError(
                  deleteMutation.error,
                  'Не удалось удалить рецензию. Попробуйте снова.',
                ).message
              }
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

function ReviewContent({ review }: { review: DisplayReview }) {
  const edited = wasReviewEdited(review.createdAt, review.updatedAt);
  const poster = review.media.poster;
  const isModerationHidden =
    'publicationState' in review && review.publicationState === 'moderation-hidden';

  return (
    <>
      <title>{`${review.title} — yaneMedia`}</title>
      <section className="relative isolate mx-auto max-w-[1600px] overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {reviewWatermarks.map((className) => (
            <YaneMark key={className} className={`absolute ${className} text-watermark`} />
          ))}
          <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
        </div>
        <article className="relative z-10 space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 rounded-card border border-context-border/80 bg-surface/40 p-4 sm:p-6 lg:p-8">
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
                    <time dateTime={review.updatedAt}>
                      {formatReviewPageDate(review.updatedAt)}
                    </time>
                  </span>
                )}
              </div>

              {isModerationHidden && (
                <div
                  role="status"
                  className="mt-6 rounded-control border border-watermark/30 bg-watermark/10 px-4 py-3"
                >
                  <p className="font-semibold text-text-primary">Рецензия скрыта модерацией</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Её видите только вы. Служебные данные модерации не раскрываются.
                  </p>
                </div>
              )}

              <div className="mt-8">
                <ReviewSpoiler
                  reviewId={review.reviewId}
                  hidden={review.bodyState === 'spoiler-hidden'}
                  content={review.body}
                  variant="detail"
                />
              </div>
              <ReviewActions review={review} />
            </div>

            <aside className="self-start rounded-card border border-context-border/80 bg-surface/40 p-3 sm:p-4 xl:sticky xl:top-6">
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
          {!isModerationHidden && <ReviewDiscussion review={review} />}
        </article>
      </section>
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
  const publicNotFound = query.error instanceof ApiClientError && query.error.status === 404;
  const ownQuery = useQuery({
    ...ownReviewQueryOptions(
      state.status === 'authenticated' ? state.user.email : 'inactive',
      reviewId,
    ),
    enabled: hasValidReviewId && state.status === 'authenticated' && publicNotFound,
    retry: false,
  });

  if (!hasValidReviewId) return <SocialNotFoundState kind="review" />;
  if (
    state.status === 'loading' ||
    query.isPending ||
    (publicNotFound && state.status === 'authenticated' && ownQuery.isPending)
  ) {
    return <SocialPageSkeleton variant="review" />;
  }
  if (query.data) return <ReviewContent key={query.data.reviewId} review={query.data} />;
  if (publicNotFound && ownQuery.data) {
    return <ReviewContent key={ownQuery.data.reviewId} review={ownQuery.data} />;
  }
  if (publicNotFound) {
    return <SocialNotFoundState kind="review" />;
  }
  return (
    <ErrorState
      variant="page"
      title="Не удалось загрузить рецензию"
      description="Проверьте соединение и попробуйте ещё раз."
      onRetry={() => void query.refetch({ cancelRefetch: false })}
    />
  );
}
