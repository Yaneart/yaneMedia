const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatReviewPageDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : dateFormatter.format(date);
}

export function wasReviewEdited(createdAt: string, updatedAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  return Number.isFinite(created) && Number.isFinite(updated) && updated > created;
}

export function formatReviewCommentCount(count: number): string {
  const normalized = Math.max(0, Math.trunc(count));
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'комментариев'
      : last === 1
        ? 'комментарий'
        : last >= 2 && last <= 4
          ? 'комментария'
          : 'комментариев';
  return `${normalized} ${word}`;
}
