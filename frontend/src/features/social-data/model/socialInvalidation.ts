import type { QueryClient, QueryKey } from '@tanstack/react-query';

export type SocialMutation =
  | { type: 'profile'; handles: readonly string[] }
  | { type: 'favorite'; handle: string; mediaRef: string }
  | { type: 'rating'; accountKey: string; handle?: string; mediaRef: string }
  | { type: 'review'; reviewId: string; handle?: string; mediaRef?: string }
  | { type: 'comment'; reviewId: string; handle?: string }
  | { type: 'moderation'; targetId: string };

function includes(queryKey: QueryKey, value: string): boolean {
  return queryKey.some((part) => part === value);
}

export function invalidateAfterSocialMutation(
  queryClient: QueryClient,
  mutation: SocialMutation,
): Promise<void> {
  const handles =
    mutation.type === 'profile'
      ? mutation.handles.map((handle) => handle.toLowerCase())
      : 'handle' in mutation && mutation.handle
        ? [mutation.handle.toLowerCase()]
        : [];
  const identifiers = [
    ...handles,
    'accountKey' in mutation ? mutation.accountKey : undefined,
    'mediaRef' in mutation ? mutation.mediaRef : undefined,
    'reviewId' in mutation ? mutation.reviewId : undefined,
    'targetId' in mutation ? mutation.targetId : undefined,
  ].filter((value): value is string => Boolean(value));

  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const isSocialQuery = includes(queryKey, 'social');
      const isAffectedMediaDetail =
        (mutation.type === 'rating' || mutation.type === 'review') &&
        queryKey[0] === 'media' &&
        queryKey[1] === 'details' &&
        mutation.mediaRef !== undefined &&
        queryKey[2] === mutation.mediaRef;

      if (isAffectedMediaDetail) return true;
      if (!isSocialQuery) return false;
      if (mutation.type === 'profile') return true;

      return (
        identifiers.some((identifier) => includes(queryKey, identifier)) ||
        (mutation.type === 'rating' &&
          (includes(queryKey, 'ratings') || includes(queryKey, 'reviews'))) ||
        (mutation.type === 'review' && includes(queryKey, 'reviews')) ||
        (mutation.type === 'comment' && includes(queryKey, 'comments')) ||
        (mutation.type === 'favorite' && includes(queryKey, 'favorites')) ||
        mutation.type === 'moderation'
      );
    },
  });
}
