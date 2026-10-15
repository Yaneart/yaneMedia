import type { QueryClient } from '@tanstack/react-query';

import type { PrivateProfile } from '@/entities/profile';
import { socialQueryKeys } from './socialQueryKeys';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function replaceCachedAuthorAvatar(
  value: unknown,
  handle: string,
  avatarUrl: string | null,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const replacement = replaceCachedAuthorAvatar(item, handle, avatarUrl);
      changed ||= replacement !== item;
      return replacement;
    });
    return changed ? next : value;
  }

  if (!isRecord(value)) return value;

  let changed = value.handle === handle && 'avatarUrl' in value && value.avatarUrl !== avatarUrl;
  const next: Record<string, unknown> = changed ? { ...value, avatarUrl } : { ...value };

  for (const [key, item] of Object.entries(value)) {
    if (key === 'avatarUrl' && value.handle === handle) continue;
    const replacement = replaceCachedAuthorAvatar(item, handle, avatarUrl);
    if (replacement !== item) {
      next[key] = replacement;
      changed = true;
    }
  }

  return changed ? next : value;
}

export function synchronizeProfileAvatarCache(
  queryClient: QueryClient,
  accountKey: string,
  profile: PrivateProfile,
): void {
  queryClient.setQueryData(socialQueryKeys.privateProfile(accountKey), profile);
  queryClient.setQueriesData(
    { predicate: ({ queryKey }) => queryKey.some((part) => part === 'social') },
    (current) => replaceCachedAuthorAvatar(current, profile.handle, profile.avatarUrl),
  );
}
