import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import {
  getPrivateProfile,
  getProfileRatings,
  getProfileSettings,
  getPublicFavorites,
  getPublicProfile,
} from '@/entities/profile';
import { getOwnRating, getRatingSummary } from '@/entities/rating';
import {
  getMediaReviews,
  getOwnReview,
  getOwnReviews,
  getProfileReviews,
  getReview,
  type ReviewSort,
} from '@/entities/review';
import { getReviewComments } from '@/entities/review-comment';
import { getNextCursorPageParam, initialCursorPageParam } from '@/shared/api';
import { socialQueryKeys, type SocialViewer } from './socialQueryKeys';

export const socialPageSize = 20;
const socialStaleTimeMs = 60_000;

export function privateProfileQueryOptions(accountKey: string) {
  return queryOptions({
    queryKey: socialQueryKeys.privateProfile(accountKey),
    queryFn: ({ signal }) => getPrivateProfile(signal),
    staleTime: socialStaleTimeMs,
  });
}

export function profileSettingsQueryOptions(accountKey: string) {
  return queryOptions({
    queryKey: socialQueryKeys.profileSettings(accountKey),
    queryFn: ({ signal }) => getProfileSettings(signal),
    staleTime: socialStaleTimeMs,
  });
}

export function publicProfileQueryOptions(handle: string) {
  return queryOptions({
    queryKey: socialQueryKeys.publicProfile(handle),
    queryFn: ({ signal }) => getPublicProfile(handle, signal),
    staleTime: socialStaleTimeMs,
  });
}

export function publicFavoritesQueryOptions(handle: string) {
  return infiniteQueryOptions({
    queryKey: socialQueryKeys.publicFavorites(handle),
    queryFn: ({ pageParam, signal }) =>
      getPublicFavorites(handle, pageParam, socialPageSize, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: getNextCursorPageParam,
    staleTime: socialStaleTimeMs,
  });
}

export function profileRatingsQueryOptions(
  owner: { kind: 'private'; accountKey: string } | { kind: 'public'; handle: string },
) {
  return infiniteQueryOptions({
    queryKey:
      owner.kind === 'private'
        ? socialQueryKeys.ownRatings(owner.accountKey)
        : socialQueryKeys.publicRatings(owner.handle),
    queryFn: ({ pageParam, signal }) => getProfileRatings(owner, pageParam, socialPageSize, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: getNextCursorPageParam,
    staleTime: socialStaleTimeMs,
  });
}

export function profileReviewsQueryOptions(handle: string, viewer: SocialViewer) {
  return infiniteQueryOptions({
    queryKey: socialQueryKeys.profileReviews(handle, viewer),
    queryFn: ({ pageParam, signal }) =>
      getProfileReviews(handle, pageParam, socialPageSize, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: getNextCursorPageParam,
    staleTime: socialStaleTimeMs,
  });
}

export function ownReviewsQueryOptions(accountKey: string) {
  return infiniteQueryOptions({
    queryKey: socialQueryKeys.ownReviews(accountKey),
    queryFn: ({ pageParam, signal }) => getOwnReviews(pageParam, socialPageSize, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: getNextCursorPageParam,
    staleTime: socialStaleTimeMs,
  });
}

export function ownReviewQueryOptions(accountKey: string, reviewId: string) {
  return queryOptions({
    queryKey: socialQueryKeys.ownReview(accountKey, reviewId),
    queryFn: ({ signal }) => getOwnReview(reviewId, signal),
    staleTime: socialStaleTimeMs,
  });
}

export function ownRatingQueryOptions(accountKey: string, mediaRef: string) {
  return queryOptions({
    queryKey: socialQueryKeys.rating(mediaRef, accountKey),
    queryFn: ({ signal }) => getOwnRating(mediaRef, signal),
    staleTime: socialStaleTimeMs,
  });
}

export function ratingSummaryQueryOptions(mediaRef: string) {
  return queryOptions({
    queryKey: socialQueryKeys.ratingSummary(mediaRef),
    queryFn: ({ signal }) => getRatingSummary(mediaRef, signal),
    staleTime: socialStaleTimeMs,
  });
}

export function mediaReviewsQueryOptions(mediaRef: string, sort: ReviewSort, viewer: SocialViewer) {
  return infiniteQueryOptions({
    queryKey: socialQueryKeys.mediaReviews(mediaRef, sort, viewer),
    queryFn: ({ pageParam, signal }) =>
      getMediaReviews(mediaRef, sort, pageParam, socialPageSize, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: getNextCursorPageParam,
    staleTime: socialStaleTimeMs,
  });
}

export function reviewQueryOptions(reviewId: string, viewer: SocialViewer) {
  return queryOptions({
    queryKey: socialQueryKeys.review(reviewId, viewer),
    queryFn: ({ signal }) => getReview(reviewId, signal),
    staleTime: socialStaleTimeMs,
  });
}

export function reviewCommentsQueryOptions(reviewId: string, viewer: SocialViewer) {
  return infiniteQueryOptions({
    queryKey: socialQueryKeys.reviewComments(reviewId, viewer),
    queryFn: ({ pageParam, signal }) =>
      getReviewComments(reviewId, pageParam, socialPageSize, undefined, signal),
    initialPageParam: initialCursorPageParam,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: socialStaleTimeMs,
  });
}
