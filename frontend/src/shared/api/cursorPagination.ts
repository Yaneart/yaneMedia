export type CursorPageDto<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export const initialCursorPageParam: string | null = null;

export function getNextCursorPageParam<T>(page: CursorPage<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

export function createCursorSearch(
  cursor: string | null,
  limit: number,
  extra: Readonly<Record<string, string | undefined>> = {},
): string {
  const search = new URLSearchParams({ limit: String(limit) });

  if (cursor) search.set('cursor', cursor);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) search.set(key, value);
  }

  return search.toString();
}

export function mapCursorPage<TDto, T>(
  page: CursorPageDto<TDto>,
  mapItem: (item: TDto) => T,
): CursorPage<T> {
  return {
    items: page.items.map(mapItem),
    nextCursor: page.nextCursor,
  };
}

export function mergeCursorPages<T>(
  pages: readonly CursorPage<T>[],
  getKey: (item: T) => string,
): T[] {
  const seen = new Set<string>();

  return pages.flatMap((page) =>
    page.items.filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
