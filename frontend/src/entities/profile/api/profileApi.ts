import { mapMediaSummary } from '@/entities/media';
import { apiRequest, createCursorSearch, mapCursorPage } from '@/shared/api';
import { API_BASE_URL } from '@/shared/api/apiConfig';
import type {
  PrivateProfile,
  ProfileMediaPage,
  ProfileRatingPage,
  ProfileSettings,
  PublicProfile,
} from '../model/profile';
import type {
  PrivateProfileDto,
  ProfileMediaPageDto,
  ProfileRatingDto,
  ProfileRatingPageDto,
  ProfileSettingsDto,
  PublicProfileDto,
} from './profileDto';

function mapAvatarUrl(url: string | null): string | null {
  return url?.startsWith('/') ? new URL(url, API_BASE_URL).toString() : url;
}

function mapPublicProfile(dto: PublicProfileDto): PublicProfile {
  return { ...dto, avatarUrl: mapAvatarUrl(dto.avatarUrl) };
}

function mapProfileRating(dto: ProfileRatingDto) {
  return { ...dto, media: mapMediaSummary(dto.media) };
}

export async function getPrivateProfile(signal?: AbortSignal): Promise<PrivateProfile> {
  const dto = await apiRequest<PrivateProfileDto>('/profile', {
    credentials: 'include',
    signal,
  });
  return { ...dto, avatarUrl: mapAvatarUrl(dto.avatarUrl) };
}

export function getProfileSettings(signal?: AbortSignal): Promise<ProfileSettings> {
  return apiRequest<ProfileSettingsDto>('/profile/settings', {
    credentials: 'include',
    signal,
  });
}

export async function getPublicProfile(
  handle: string,
  signal?: AbortSignal,
): Promise<PublicProfile> {
  return mapPublicProfile(
    await apiRequest<PublicProfileDto>(`/profiles/${encodeURIComponent(handle)}`, { signal }),
  );
}

export async function getPublicFavorites(
  handle: string,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ProfileMediaPage> {
  const search = createCursorSearch(cursor, limit);
  const dto = await apiRequest<ProfileMediaPageDto>(
    `/profiles/${encodeURIComponent(handle)}/favorites?${search}`,
    { signal },
  );
  return mapCursorPage(dto, mapMediaSummary);
}

export async function getProfileRatings(
  owner: { kind: 'private' } | { kind: 'public'; handle: string },
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ProfileRatingPage> {
  const path =
    owner.kind === 'private'
      ? '/profile/ratings'
      : `/profiles/${encodeURIComponent(owner.handle)}/ratings`;
  const dto = await apiRequest<ProfileRatingPageDto>(
    `${path}?${createCursorSearch(cursor, limit)}`,
    { credentials: owner.kind === 'private' ? 'include' : 'same-origin', signal },
  );
  return mapCursorPage(dto, mapProfileRating);
}
