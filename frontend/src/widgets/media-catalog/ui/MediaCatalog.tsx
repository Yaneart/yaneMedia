import { MediaGrid, SearchInput } from '@/shared';
import type { ReactNode } from 'react';

export type MediaCatalogProps = {
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  children: ReactNode;
};

export function MediaCatalog({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Поиск по каталогу',
  filters,
  children,
}: MediaCatalogProps) {
  return (
    <section>
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-title font-semibold">{title}</h1>
        <SearchInput
          aria-label={`Поиск: ${title}`}
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
        {filters}
      </div>
      <MediaGrid>{children}</MediaGrid>
    </section>
  );
}
