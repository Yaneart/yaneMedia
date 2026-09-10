import { Button } from '@/shared';

export type LibraryDataNoticeProps = {
  partial: boolean;
  stale: boolean;
  refreshFailed?: boolean;
  onRetry: () => void;
};

export function LibraryDataNotice({
  partial,
  stale,
  refreshFailed = false,
  onRetry,
}: LibraryDataNoticeProps) {
  if (!partial && !stale && !refreshFailed) {
    return null;
  }

  const message = refreshFailed
    ? 'Не удалось обновить медиатеку. Показаны сохранённые данные.'
    : partial
      ? 'Часть сохранённых произведений временно недоступна. Показаны доступные данные.'
      : 'Показана сохранённая версия медиатеки. Данные могут обновиться позже.';

  return (
    <div
      role={refreshFailed ? 'alert' : 'status'}
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
    >
      <p className="text-caption text-text-secondary">{message}</p>

      <Button size="small" variant="ghost" onClick={onRetry}>
        {refreshFailed ? 'Повторить' : 'Обновить'}
      </Button>
    </div>
  );
}
