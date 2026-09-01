import type { MediaSummary, MediaType } from '@/entities/media';

export type MediaCollection = {
  id: string;
  title: string;
  items: MediaSummary[];
};

const collectionSize = 10;

const thematicCollections: Record<
  MediaType,
  {
    id: string;
    title: string;
    genres: string[];
  }
> = {
  movie: {
    id: 'science-fiction-and-adventure',
    title: 'Фантастика и приключения',
    genres: ['фантастика', 'sci-fi', 'приключения', 'adventure', 'фэнтези', 'fantasy'],
  },
  series: {
    id: 'crime-and-mystery',
    title: 'Криминал, тайны и напряжение',
    genres: ['криминал', 'crime', 'триллер', 'thriller', 'детектив', 'mystery'],
  },
  anime: {
    id: 'action-and-adventure',
    title: 'Экшен и приключения',
    genres: ['action', 'adventure', 'fantasy'],
  },
};

export function createMediaCollections(type: MediaType, media: MediaSummary[]): MediaCollection[] {
  const thematicCollection = thematicCollections[type];

  const highRated = [...media]
    .filter((item) => item.rating !== undefined)
    .sort((left, right) => (right.rating?.value ?? 0) - (left.rating?.value ?? 0))
    .slice(0, collectionSize);

  const thematicItems = media
    .filter((item) =>
      item.genres.some((genre) =>
        thematicCollection.genres.includes(genre.trim().toLocaleLowerCase('ru')),
      ),
    )
    .slice(0, collectionSize);

  return [
    {
      id: 'editorial-picks',
      title: 'Выбор редакции',
      items: media.slice(0, collectionSize),
    },
    {
      id: 'high-rated',
      title: 'Высокий рейтинг',
      items: highRated,
    },
    {
      id: thematicCollection.id,
      title: thematicCollection.title,
      items: thematicItems,
    },
  ].filter((collection) => collection.items.length === collectionSize);
}
