export function formatReleaseDate(value?: string): string {
  if (!value) return 'Дата уточняется';
  if (/^\d{4}$/.test(value)) return `${value} год`;
  const date = new Date(`${value.length === 7 ? `${value}-01` : value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'Дата уточняется';
  return date.toLocaleDateString('ru-RU', {
    ...(value.length === 7 ? {} : { day: 'numeric' }),
    month: 'long',
    ...(value.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}
