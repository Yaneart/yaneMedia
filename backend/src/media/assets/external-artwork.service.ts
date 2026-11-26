import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaEgress, redirectLocation } from '../media-egress';
import type { MediaDetailsDto } from '../dto/media-details.dto';
import type { MediaArtworkDto, MediaSummaryDto } from '../dto/media-summary.dto';

const SHIKIMORI_ARTWORK =
  /^\/(uploads\/(poster|person|character)\/|system\/(animes|mangas|people|characters|screenshots)\/)/;
const ARTWORK_PATHS = new Map<string, RegExp>([
  ['image.tmdb.org', /^\/t\/p\//],
  ['media.themoviedb.org', /^\/t\/p\//],
  ['shikimori.io', SHIKIMORI_ARTWORK],
  ['shikimori.one', SHIKIMORI_ARTWORK],
  ['s4.anilist.co', /^\/file\/anilistcdn\//],
  ['cdn.anilist.co', /^\/file\/anilistcdn\//],
  ['images.metahub.space', /^\/(poster|background|logo)\//],
  ['static.tvmaze.com', /^\/uploads\/images\//],
  ['m.media-amazon.com', /^\/images\/M\//],
]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
export const EXTERNAL_ARTWORK_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function artworkUrl(value: string): URL | undefined {
  if (value.length > 2_048) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      ARTWORK_PATHS.get(url.hostname)?.test(url.pathname)
    ) {
      return url;
    }
  } catch {
    return;
  }
}

@Injectable()
export class ExternalArtworkService {
  constructor(private readonly egress: MediaEgress) {}

  publicUrl(source: string): string {
    const url = this.egress.enabled && artworkUrl(source);
    return url
      ? `/api/v1/media/artwork/external?${new URLSearchParams({ url: url.href })}`
      : source;
  }

  summary<T extends MediaSummaryDto>(item: T): T {
    if (!this.egress.enabled) return item;
    return { ...item, poster: this.image(item.poster), backdrop: this.image(item.backdrop) };
  }

  details(item: MediaDetailsDto): MediaDetailsDto {
    if (!this.egress.enabled) return item;
    const result = this.summary(item);
    result.persons = result.persons.map((person) => ({
      ...person,
      photo: this.image(person.photo),
    }));
    const episodes = <T extends { still?: MediaArtworkDto }>(items: T[]) =>
      items.map((episode) => ({ ...episode, still: this.image(episode.still) }));
    if (result.type === 'series') {
      result.seasons = result.seasons.map((season) => ({
        ...season,
        poster: this.image(season.poster),
        episodes: episodes(season.episodes),
      }));
    } else if (result.type === 'anime') {
      result.episodes = episodes(result.episodes);
    }
    return result;
  }

  private image(image?: MediaArtworkDto): MediaArtworkDto | undefined {
    return image && { ...image, url: this.publicUrl(image.url) };
  }

  async open(source: string, signal: AbortSignal) {
    let url = this.egress.enabled ? artworkUrl(source) : undefined;
    if (!url) throw new NotFoundException('External artwork not found');

    try {
      for (let redirects = 0; ; redirects += 1) {
        const response = await this.egress.fetch(url, { signal, redirect: 'manual' });
        const location = redirectLocation(response);
        if (location) {
          await response.body?.cancel();
          url = artworkUrl(new URL(location, url).href);
          if (!url || redirects >= MAX_REDIRECTS) break;
          continue;
        }

        const contentType = response.headers
          .get('content-type')
          ?.split(';', 1)[0]
          .trim()
          .toLowerCase();
        const size = Number(response.headers.get('content-length'));
        if (
          response.ok &&
          response.body &&
          contentType &&
          IMAGE_TYPES.has(contentType) &&
          size <= EXTERNAL_ARTWORK_MAX_BYTES
        ) {
          return { body: response.body, contentType };
        }
        await response.body?.cancel();
        if (response.status === 404) throw new NotFoundException('External artwork not found');
        break;
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
    }
    throw new BadGatewayException('External artwork unavailable');
  }
}
