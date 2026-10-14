import type { MediaSummaryDto } from '@/entities/media';
import type { CursorPageDto } from '@/shared/api';

export type ProfileVisibilityDto = {
  ratings: boolean;
  favorites: boolean;
};

export type ProfileCountsDto = {
  reviews: number;
  comments: number;
  ratings: number;
  favorites: number;
};

export type PublicProfileDto = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  joinedAt: string;
  visibility: ProfileVisibilityDto;
  counts: Omit<ProfileCountsDto, 'ratings' | 'favorites'> & {
    ratings: number | null;
    favorites: number | null;
  };
};

export type PrivateProfileDto = Omit<PublicProfileDto, 'counts'> & {
  counts: ProfileCountsDto;
  email: string;
  emailVerified: boolean;
};

export type ProfileSettingsDto = {
  ratingsVisibility: 'public' | 'private';
  favoritesVisibility: 'public' | 'private';
};

export type ProfileRatingDto = {
  media: MediaSummaryDto;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfileMediaPageDto = CursorPageDto<MediaSummaryDto>;
export type ProfileRatingPageDto = CursorPageDto<ProfileRatingDto>;
