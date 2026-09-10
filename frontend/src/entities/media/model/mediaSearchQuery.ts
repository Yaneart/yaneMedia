export const maximumMediaSearchQueryLength = 100;

export function normalizeMediaSearchQuery(value: string | null | undefined): string {
  return value?.trim().slice(0, maximumMediaSearchQueryLength) ?? '';
}
