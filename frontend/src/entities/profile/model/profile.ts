import type { MediaSummary } from '@/entities/media';
import type { CursorPage } from '@/shared/api';

export type ProfileVisibility = {
  ratings: boolean;
  favorites: boolean;
};

export type ProfileCounts = {
  reviews: number;
  comments: number;
  ratings: number;
  favorites: number;
};

export type PublicProfile = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  joinedAt: string;
  visibility: ProfileVisibility;
  counts: Omit<ProfileCounts, 'ratings' | 'favorites'> & {
    ratings: number | null;
    favorites: number | null;
  };
};

export type PrivateProfile = Omit<PublicProfile, 'counts'> & {
  counts: ProfileCounts;
  email: string;
  emailVerified: boolean;
};

export type ProfileSettings = {
  ratingsVisibility: 'public' | 'private';
  favoritesVisibility: 'public' | 'private';
};

export type ProfileRating = {
  media: MediaSummary;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfileMediaPage = CursorPage<MediaSummary>;
export type ProfileRatingPage = CursorPage<ProfileRating>;
