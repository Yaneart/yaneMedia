import type { MediaType } from '@/entities/media';
import type { SelectOption } from '@/shared';

const earliestYearByType: Record<MediaType, number> = {
  movie: 1920,
  series: 1960,
  anime: 1917,
};

export function getYearOptions(
  type: MediaType,
  currentYear = new Date().getFullYear(),
): readonly SelectOption[] {
  const earliestYear = earliestYearByType[type];

  return Array.from({ length: currentYear - earliestYear + 1 }, (_, index) => {
    const year = String(currentYear - index);

    return { value: year, label: year };
  });
}
