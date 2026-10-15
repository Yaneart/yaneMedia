export type SocialViewer = { accountKey: string } | 'guest';

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

function viewerRoot(viewer: SocialViewer) {
  return viewer === 'guest'
    ? (['social', 'guest'] as const)
    : (['account', viewer.accountKey, 'social'] as const);
}

export const socialQueryKeys = {
  publicRoot: ['social', 'public'] as const,
  privateRoot: (accountKey: string) => ['account', accountKey, 'social'] as const,
  privateProfile: (accountKey: string) =>
    [...socialQueryKeys.privateRoot(accountKey), 'profile'] as const,
  profileSettings: (accountKey: string) =>
    [...socialQueryKeys.privateProfile(accountKey), 'settings'] as const,
  ownRatings: (accountKey: string) =>
    [...socialQueryKeys.privateProfile(accountKey), 'ratings'] as const,
  ownReviews: (accountKey: string) =>
    [...socialQueryKeys.privateProfile(accountKey), 'reviews'] as const,
  ownReview: (accountKey: string, reviewId: string) =>
    [...socialQueryKeys.ownReviews(accountKey), 'detail', reviewId] as const,
  ownReviewForMedia: (accountKey: string, mediaRef: string) =>
    [...socialQueryKeys.ownReviews(accountKey), 'media', mediaRef] as const,
  publicProfile: (handle: string) =>
    [...socialQueryKeys.publicRoot, 'profiles', normalizeHandle(handle)] as const,
  publicFavorites: (handle: string) =>
    [...socialQueryKeys.publicProfile(handle), 'favorites'] as const,
  publicRatings: (handle: string) => [...socialQueryKeys.publicProfile(handle), 'ratings'] as const,
  profileReviews: (handle: string, viewer: SocialViewer) =>
    [...viewerRoot(viewer), 'profiles', normalizeHandle(handle), 'reviews'] as const,
  rating: (mediaRef: string, accountKey: string) =>
    [...socialQueryKeys.privateRoot(accountKey), 'media', mediaRef, 'rating'] as const,
  ratingSummary: (mediaRef: string) =>
    [...socialQueryKeys.publicRoot, 'media', mediaRef, 'rating-summary'] as const,
  mediaReviews: (mediaRef: string, sort: string, viewer: SocialViewer) =>
    [...viewerRoot(viewer), 'media', mediaRef, 'reviews', { sort }] as const,
  mediaComments: (mediaRef: string, viewer: SocialViewer) =>
    [...viewerRoot(viewer), 'media', mediaRef, 'comments'] as const,
  review: (reviewId: string, viewer: SocialViewer) =>
    [...viewerRoot(viewer), 'reviews', reviewId] as const,
  reviewComments: (reviewId: string, viewer: SocialViewer) =>
    [...socialQueryKeys.review(reviewId, viewer), 'comments'] as const,
};
