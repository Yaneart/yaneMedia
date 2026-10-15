import type { ReviewSort } from '@/entities/review';
export { createSpoilerExcerpt } from '../../review-spoiler/model/reviewSpoiler';

export const mediaReviewSortOptions = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'updated', label: 'Недавно обновлённые' },
  { value: 'rating-high', label: 'С высокой оценкой' },
  { value: 'rating-low', label: 'С низкой оценкой' },
] as const satisfies ReadonlyArray<{ value: ReviewSort; label: string }>;

export function isReviewSort(value: string | null): value is ReviewSort {
  return mediaReviewSortOptions.some((option) => option.value === value);
}

const reviewDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatMediaReviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : reviewDateFormatter.format(date);
}
