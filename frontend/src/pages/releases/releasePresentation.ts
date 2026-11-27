export function formatReleaseDate(value?: string): string {
  if (!value) return 'Дата уточняется';
  if (/^\d{4}$/.test(value)) return `${value} год`;
  const timeZone = value.includes('T') ? 'Europe/Moscow' : 'UTC';
  const date = new Date(value.length === 7 ? `${value}-01` : value);
  if (!Number.isFinite(date.getTime())) return 'Дата уточняется';
  const yearFormat = new Intl.DateTimeFormat('ru-RU', { year: 'numeric', timeZone });
  return date.toLocaleDateString('ru-RU', {
    ...(value.length === 7 ? {} : { day: 'numeric' }),
    month: 'long',
    ...(yearFormat.format(date) === yearFormat.format(new Date()) ? {} : { year: 'numeric' }),
    timeZone,
  });
}
