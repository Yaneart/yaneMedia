export function normalizeModerationDecision(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateModerationDecision(value: string): string | null {
  const normalized = normalizeModerationDecision(value);
  if (!normalized) return 'Укажите служебное основание решения.';
  if (Array.from(normalized).length > 1000 || /[<>]/u.test(normalized)) {
    return 'Решение: до 1000 символов обычного текста без угловых скобок.';
  }
  return null;
}
