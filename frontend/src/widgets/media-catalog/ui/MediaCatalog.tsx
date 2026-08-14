import { MediaCard, type MediaRef, type MediaSummary } from '@/entities/media';
import { MediaGrid, SearchInput } from '@/shared';
import { useState, type ReactNode } from 'react';

export type MediaCatalogProps = {
  title: string;
  media: readonly MediaSummary[];
  onOpen: (mediaRef: MediaRef) => void;
  filters?: ReactNode;
};

export function MediaCatalog({ title, filters, media, onOpen }: MediaCatalogProps) {
  const [searchValue, setSearchValue] = useState('');
  const [favoriteMediaRefs, setFavoriteMediaRefs] = useState<Set<MediaRef>>(() => new Set());

  const toggleFavorite = (mediaRef: MediaRef) => {
    setFavoriteMediaRefs((current) => {
      const next = new Set(current);

      if (next.has(mediaRef)) {
        next.delete(mediaRef);
      } else {
        next.add(mediaRef);
      }

      return next;
    });
  };

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-title font-semibold">{title}</h1>
        <SearchInput
          aria-label={`Поиск: ${title}`}
          value={searchValue}
          placeholder="Поиск по каталогу"
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />
        {filters}
      </div>
      <MediaGrid>
        {media.map((item) => (
          <MediaCard
            key={item.mediaRef}
            media={item}
            onOpen={() => onOpen(item.mediaRef)}
            isFavorite={favoriteMediaRefs.has(item.mediaRef)}
            onFavoriteChange={() => toggleFavorite(item.mediaRef)}
          />
        ))}
      </MediaGrid>
    </section>
  );
}
