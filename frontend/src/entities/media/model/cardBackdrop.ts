import type { MediaArtwork } from './media';

export function getCardBackdrop(artwork: MediaArtwork | undefined): MediaArtwork | undefined {
  if (!artwork) return undefined;

  const url = artwork.url.replace(
    /(\/api\/v1\/media\/assets\/backdrop\/[a-f0-9]{64}\.(?:jpg|png|webp))$/,
    '$1/card',
  );
  return url === artwork.url ? artwork : { ...artwork, url };
}
