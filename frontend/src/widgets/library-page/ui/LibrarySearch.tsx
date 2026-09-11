import { SearchInput } from '@/shared';

type LibrarySearchProps = {
  label: string;
  query: string;
  visibleCount: number;
  totalCount: number;
  onQueryChange: (query: string) => void;
};

export function LibrarySearch({
  label,
  query,
  visibleCount,
  totalCount,
  onQueryChange,
}: LibrarySearchProps) {
  const hasQuery = query.trim().length > 0;
  const countLabel = hasQuery
    ? `Найдено: ${visibleCount} из ${totalCount}`
    : `Всего: ${totalCount}`;

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-card border border-context-border bg-surface-elevated p-4 sm:flex-row sm:items-center">
      <SearchInput
        aria-label={label}
        value={query}
        maxLength={100}
        autoComplete="off"
        placeholder="Найти по названию"
        className="sm:max-w-md"
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />

      <p className="shrink-0 text-caption text-text-secondary sm:ml-auto">{countLabel}</p>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {hasQuery
          ? visibleCount > 0
            ? `Найдено произведений: ${visibleCount}.`
            : 'В библиотеке ничего не найдено.'
          : ''}
      </p>
    </div>
  );
}
