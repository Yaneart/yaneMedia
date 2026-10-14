import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';

import { useAuth } from '@/entities/auth';
import type { MediaSummary } from '@/entities/media';
import type { PrivateProfile, PublicProfile } from '@/entities/profile';
import {
  deleteRating,
  upsertRating,
  type Rating,
  type RatingSummary,
  type RatingValue,
} from '@/entities/rating';
import {
  invalidateAfterSocialMutation,
  ownRatingQueryOptions,
  privateProfileQueryOptions,
  ratingSummaryQueryOptions,
  socialQueryKeys,
} from '@/features/social-data';
import { ApiClientError } from '@/shared/api';
import { Button, createReturnToSearch, StarIcon } from '@/shared';
import type { InfiniteData } from '@tanstack/react-query';
import type { ProfileRatingPage } from '@/entities/profile';
import {
  applyRatingPageChange,
  applyRatingSummaryChange,
  createOptimisticRating,
} from '../model/ratingOptimistic';

const ratingValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type RatingMutation = { value: RatingValue | null };
type CacheSnapshot = Array<[QueryKey, unknown]>;

function getMutationError(error: Error): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Сессия завершилась. Войдите снова, чтобы поставить оценку.';
    if (error.status === 429)
      return 'Слишком много изменений. Подождите немного и попробуйте снова.';
  }

  return 'Не удалось сохранить оценку. Предыдущее значение восстановлено.';
}

export type UserRatingProps = {
  media: MediaSummary;
  className?: string;
  embedded?: boolean;
};

export function UserRating({ media, className = '', embedded = false }: UserRatingProps) {
  const { state: authState, setGuest } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : null;

  const summaryQuery = useQuery(ratingSummaryQueryOptions(media.mediaRef));
  const { data: profile } = useQuery({
    ...privateProfileQueryOptions(accountKey ?? 'inactive'),
    enabled: accountKey !== null,
  });
  const ownRatingQuery = useQuery({
    ...ownRatingQueryOptions(accountKey ?? 'inactive', media.mediaRef),
    enabled: accountKey !== null,
  });

  const mutation = useMutation<Rating | null, Error, RatingMutation, CacheSnapshot>({
    mutationFn: ({ value }) =>
      value === null
        ? deleteRating(media.mediaRef).then(() => null)
        : upsertRating(media.mediaRef, value),
    onMutate: async ({ value }) => {
      if (!accountKey) return [];

      await Promise.all([
        queryClient.cancelQueries({ queryKey: socialQueryKeys.privateRoot(accountKey) }),
        queryClient.cancelQueries({
          queryKey: socialQueryKeys.ratingSummary(media.mediaRef),
          exact: true,
        }),
      ]);

      const handle = profile?.handle;
      const keys = [
        socialQueryKeys.rating(media.mediaRef, accountKey),
        socialQueryKeys.ratingSummary(media.mediaRef),
        socialQueryKeys.privateProfile(accountKey),
        socialQueryKeys.ownRatings(accountKey),
        ...(handle
          ? [socialQueryKeys.publicProfile(handle), socialQueryKeys.publicRatings(handle)]
          : []),
      ];
      const snapshot = keys.map(
        (queryKey) => [queryKey, queryClient.getQueryData(queryKey)] as [QueryKey, unknown],
      );
      const previous =
        queryClient.getQueryData<Rating | null>(
          socialQueryKeys.rating(media.mediaRef, accountKey),
        ) ?? null;
      const optimistic = createOptimisticRating({
        media,
        previous,
        nextValue: value,
        changedAt: new Date().toISOString(),
      });
      const countDelta =
        previous === null ? (optimistic === null ? 0 : 1) : optimistic === null ? -1 : 0;

      queryClient.setQueryData(socialQueryKeys.rating(media.mediaRef, accountKey), optimistic);
      queryClient.setQueryData<RatingSummary>(
        socialQueryKeys.ratingSummary(media.mediaRef),
        (current) => applyRatingSummaryChange(current, previous?.value ?? null, value),
      );
      queryClient.setQueryData<PrivateProfile>(
        socialQueryKeys.privateProfile(accountKey),
        (current) =>
          current && {
            ...current,
            counts: { ...current.counts, ratings: current.counts.ratings + countDelta },
          },
      );
      queryClient.setQueryData<InfiniteData<ProfileRatingPage>>(
        socialQueryKeys.ownRatings(accountKey),
        (current) => applyRatingPageChange(current, optimistic, media),
      );

      if (handle) {
        queryClient.setQueryData<PublicProfile>(socialQueryKeys.publicProfile(handle), (current) =>
          current && current.counts.ratings !== null
            ? {
                ...current,
                counts: { ...current.counts, ratings: current.counts.ratings + countDelta },
              }
            : current,
        );
        if (profile.visibility.ratings) {
          queryClient.setQueryData<InfiniteData<ProfileRatingPage>>(
            socialQueryKeys.publicRatings(handle),
            (current) => applyRatingPageChange(current, optimistic, media),
          );
        }
      }

      return snapshot;
    },
    onSuccess: (rating) => {
      if (!accountKey) return;
      queryClient.setQueryData(socialQueryKeys.rating(media.mediaRef, accountKey), rating);
    },
    onError: (error, _variables, snapshot) => {
      snapshot?.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      if (error instanceof ApiClientError && error.status === 401) setGuest();
    },
    onSettled: async () => {
      if (!accountKey) return;
      const currentProfile = queryClient.getQueryData<PrivateProfile>(
        socialQueryKeys.privateProfile(accountKey),
      );
      await invalidateAfterSocialMutation(queryClient, {
        type: 'rating',
        accountKey,
        handle: currentProfile?.handle,
        mediaRef: media.mediaRef,
      });
    },
  });

  const currentValue = ownRatingQuery.data?.value ?? null;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <section
      aria-label="Оценка yaneMedia"
      className={[
        embedded
          ? 'rounded-control border border-border bg-control/50 p-4 sm:p-5'
          : 'rounded-card border border-context-border bg-surface-elevated p-4 sm:p-5',
        className,
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <StarIcon className="size-5 text-action" aria-hidden="true" />
            Оценка yaneMedia
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {embedded && 'Оценка появится рядом с рецензией и сохранится отдельно от неё. '}
            {summaryQuery.data?.average === null
              ? 'Пока нет оценок'
              : summaryQuery.data
                ? `${summaryQuery.data.average.toFixed(1)} из 10 · ${summaryQuery.data.count}`
                : summaryQuery.isError
                  ? 'Общий рейтинг временно недоступен'
                  : 'Загружаем общий рейтинг…'}
          </p>
        </div>
        {currentValue !== null && (
          <span className="rounded-pill bg-action/12 px-3 py-1 text-sm font-semibold text-action">
            {currentValue}/10
          </span>
        )}
      </div>

      {authState.status === 'guest' || authState.status === 'error' ? (
        <p className="mt-4 text-sm text-text-secondary">
          <Link
            to={{ pathname: '/login', search: createReturnToSearch(returnTo) }}
            className="font-semibold text-action underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
          >
            Войдите
          </Link>{' '}
          и поставьте свою оценку.
        </p>
      ) : authState.status === 'loading' || ownRatingQuery.isPending ? (
        <p className="mt-4 text-sm text-text-secondary" aria-live="polite">
          Загружаем вашу оценку…
        </p>
      ) : ownRatingQuery.isError ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-danger" role="alert">
            Не удалось загрузить вашу оценку.
          </p>
          <Button variant="secondary" size="small" onClick={() => void ownRatingQuery.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <>
          <fieldset className="mt-4" disabled={mutation.isPending}>
            <legend className="text-sm font-medium text-text-primary">
              {currentValue === null ? 'Вы ещё не оценили' : `Ваша оценка: ${currentValue} из 10`}
            </legend>
            <div
              className={[
                'mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10',
                embedded ? '' : 'xl:grid-cols-5 2xl:grid-cols-10',
              ].join(' ')}
            >
              {ratingValues.map((value) => (
                <label key={value} className="relative cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name={`rating-${media.mediaRef}`}
                    value={value}
                    checked={currentValue === value}
                    aria-label={`Поставить оценку ${value} из 10 на yaneMedia`}
                    onChange={() => mutation.mutate({ value })}
                  />
                  <span className="flex min-h-10 items-center justify-center rounded-control border border-border bg-control text-sm font-semibold text-text-primary transition-colors hover:border-action/60 hover:bg-control-hover peer-checked:border-action peer-checked:bg-action peer-checked:text-action-text peer-focus-visible:ring-2 peer-focus-visible:ring-action/25 motion-reduce:transition-none">
                    {value}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
            <p className="text-sm text-text-secondary" aria-live="polite">
              {mutation.isPending
                ? 'Сохраняем оценку…'
                : currentValue
                  ? `Вы поставили ${currentValue} из 10`
                  : 'Выберите число от 1 до 10'}
            </p>
            {currentValue !== null && (
              <Button
                variant="ghost"
                size="small"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ value: null })}
              >
                Удалить
              </Button>
            )}
          </div>
          {mutation.isError && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {getMutationError(mutation.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
