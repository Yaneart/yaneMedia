import { Button } from '@/shared';

export type LibraryDataNoticeProps = {
  partial: boolean;
  stale: boolean;
  onRetry: () => void;
};

export function LibraryDataNotice({ partial, stale, onRetry }: LibraryDataNoticeProps) {
  if (!partial && !stale) {
    return null;
  }

  const message = partial
    ? 'Часть сохранённых произведений временно недоступна. Показаны доступные данные.'
    : 'Показана сохранённая версия медиатеки. Данные могут обновиться позже.';

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
    >
      <p className="text-caption text-text-secondary">{message}</p>

      <Button size="small" variant="ghost" onClick={onRetry}>
        Обновить
      </Button>
    </div>
  );
}
