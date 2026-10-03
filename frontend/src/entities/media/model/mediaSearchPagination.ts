import type { MediaSummary } from './media';

export const mediaSearchPageSize = 48;
export const maximumMediaSearchWindow = 250;

export type MediaSearchPage<T = MediaSummary> = {
  items: T[];
  nextOffset: number;
  hasMore: boolean;
};

export function getMediaSearchPageWindow(offset: number) {
  const visibleLimit = Math.min(mediaSearchPageSize, maximumMediaSearchWindow - offset);

  return {
    visibleLimit,
    requestLimit: Math.min(visibleLimit + 1, maximumMediaSearchWindow - offset),
  };
}

export function createMediaSearchPage<T>(items: T[], offset: number): MediaSearchPage<T> {
  const { visibleLimit, requestLimit } = getMediaSearchPageWindow(offset);

  return {
    items: items.slice(0, visibleLimit),
    nextOffset: offset + visibleLimit,
    hasMore: requestLimit > visibleLimit && items.length > visibleLimit,
  };
}

export function collectUniqueMediaSearchItems<T extends Pick<MediaSummary, 'mediaRef'>>(
  pages: ReadonlyArray<Pick<MediaSearchPage<T>, 'items'>>,
): T[] {
  const mediaRefs = new Set<string>();

  return pages.flatMap((page) =>
    page.items.filter((item) => {
      if (mediaRefs.has(item.mediaRef)) return false;

      mediaRefs.add(item.mediaRef);
      return true;
    }),
  );
}
