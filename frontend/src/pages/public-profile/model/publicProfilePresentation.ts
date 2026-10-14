import type { PublicProfile } from '@/entities/profile';

export type PublicProfileTabId = 'reviews' | 'ratings' | 'favorites';

export type PublicProfileTab = {
  id: PublicProfileTabId;
  label: string;
  count: number | null;
  isPrivate: boolean;
};

const joinedAtFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatProfileJoinedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата регистрации неизвестна';

  const parts = joinedAtFormatter.formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = parts.find((part) => part.type === 'year')?.value;
  return month && year ? `На yaneMedia с ${month} ${year} г.` : 'Дата регистрации неизвестна';
}

export function getPublicProfileTabs(profile: PublicProfile): PublicProfileTab[] {
  return [
    { id: 'reviews', label: 'Рецензии', count: profile.counts.reviews, isPrivate: false },
    {
      id: 'ratings',
      label: 'Оценки',
      count: profile.visibility.ratings ? profile.counts.ratings : null,
      isPrivate: !profile.visibility.ratings,
    },
    {
      id: 'favorites',
      label: 'Избранное',
      count: profile.visibility.favorites ? profile.counts.favorites : null,
      isPrivate: !profile.visibility.favorites,
    },
  ];
}

export function getPublicProfileDescription(profile: PublicProfile): string {
  const bio = profile.bio.trim().replace(/\s+/g, ' ');
  return bio || `Публичный профиль ${profile.displayName} на yaneMedia.`;
}
