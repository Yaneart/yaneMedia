import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import { MediaRegistryService } from '../registry/media-registry.service';
import type { ReleasesQueryDto } from './releases-query.dto';
import { paginateReleases } from './releases-pagination';
import { ExternalArtworkService } from '../assets/external-artwork.service';
import { MediaEgress } from '../media-egress';

export interface ReleaseItem extends MediaSummaryDto {
  releaseDate?: string;
  nextEpisodeAt?: string;
}
export interface ReleasePage {
  items: ReleaseItem[];
  hasMore: boolean;
  partial: boolean;
}
interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  vote_average?: number;
}
interface AnimeItem {
  id: string;
  name: string;
  russian?: string;
  score?: number;
  status: string;
  airedOn?: { year?: number; month?: number; day?: number };
  poster?: { main2xUrl?: string; mainUrl?: string };
  nextEpisodeAt?: string;
}
type Candidate = ReleaseItem & { providerId: string; imdb?: string };

const SCHEDULE_DAYS = 30;
const dateAfterDays = (now: Date, days: number) =>
  new Date(now.getTime() + days * 86400_000).toISOString().slice(0, 10);

export function hasRussianTitle(title?: string): title is string {
  return typeof title === 'string' && /[а-яё]/i.test(title);
}

export function animeReleaseDate(date: AnimeItem['airedOn']): string | undefined {
  if (!date?.year) return undefined;
  return [
    date.year,
    date.month && String(date.month).padStart(2, '0'),
    date.month && date.day && String(date.day).padStart(2, '0'),
  ]
    .filter(Boolean)
    .join('-');
}

export function tmdbReleaseParams(query: ReleasesQueryDto, now: Date): URLSearchParams {
  const recent = query.period === 'recent';
  const schedule = query.period === 'schedule';
  const field =
    query.type === 'movie'
      ? 'primary_release_date'
      : recent || schedule
        ? 'air_date'
        : 'first_air_date';
  const params = new URLSearchParams({
    page: String(query.page),
    include_adult: 'false',
    sort_by: 'popularity.desc',
  });
  params.set(`${field}.gte`, dateAfterDays(now, recent ? -90 : schedule ? 0 : 1));
  params.set(`${field}.lte`, dateAfterDays(now, recent ? 0 : schedule ? SCHEDULE_DAYS : 180));
  if (recent) {
    params.set('vote_average.gte', '6.5');
    params.set('vote_count.gte', query.type === 'movie' ? '30' : '50');
  }
  if (query.type === 'series') {
    params.set('without_genres', '10763,10764,10766,10767');
    if (recent || schedule) params.set('first_air_date.lte', dateAfterDays(now, 0));
  }
  return params;
}

@Injectable()
export class ReleasesService {
  private readonly cache = new Map<string, { expires: number; value: ReleasePage }>();
  private readonly pending = new Map<string, Promise<ReleasePage>>();

  constructor(
    private readonly config: ConfigService,
    private readonly registry: MediaRegistryService,
    private readonly egress?: MediaEgress,
    private readonly artwork?: ExternalArtworkService,
  ) {}

  getReleases(query: ReleasesQueryDto): Promise<ReleasePage> {
    if (query.type === 'movie' && query.period === 'schedule') {
      throw new BadRequestException('Episode schedules are available for series and anime');
    }
    const deadline = Date.now() + 30_000;
    return paginateReleases(query.page, (page) => {
      if (Date.now() > deadline) {
        throw new ServiceUnavailableException('Releases are temporarily unavailable');
      }
      return this.getProviderPage({ ...query, page });
    });
  }

  private getProviderPage(query: ReleasesQueryDto): Promise<ReleasePage> {
    const key = `${query.type}:${query.period}:${query.page}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.load(query)
      .then((value) => {
        const oldest = Array.from(this.cache.keys())[0];
        if (this.cache.size >= 100 && oldest !== undefined) this.cache.delete(oldest);
        this.cache.set(key, { expires: Date.now() + 300_000, value });
        return value;
      })
      .catch(() => {
        throw new ServiceUnavailableException('Releases are temporarily unavailable');
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const options = {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    };
    const response = await (this.egress ? this.egress.fetch(url, options) : fetch(url, options));
    if (!response.ok) throw new Error('Release provider unavailable');
    return response.json() as Promise<T>;
  }

  private poster(url: string) {
    return { url: this.artwork?.publicUrl(url) ?? url };
  }

  private tmdb<T>(path: string, params = new URLSearchParams(), signal?: AbortSignal): Promise<T> {
    const key = this.config.get<string>('TMDB_API_KEY');
    if (!key) throw new Error('TMDB is not configured');
    params.set('api_key', key);
    params.set('language', 'ru-RU');
    return this.json<T>(`https://api.themoviedb.org/3/${path}?${params}`, { signal });
  }

  private async anime(query: ReleasesQueryDto, now: Date) {
    const schedule = query.period === 'schedule';
    const fields =
      'id name russian score status airedOn { year month day } poster { main2xUrl mainUrl }' +
      (schedule ? ' nextEpisodeAt' : '');
    const args = `page: ${query.page}, limit: 20, order: popularity, kind: "tv,movie,ona,ova", censored: true`;
    const since = dateAfterDays(now, -90);
    const today = dateAfterDays(now, 0);
    const scheduleEnd = dateAfterDays(now, SCHEDULE_DAYS);
    const result = await this.json<{
      data?: { animes: AnimeItem[]; ongoing?: AnimeItem[] };
      errors?: unknown[];
    }>('https://shikimori.io/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.config.get<string>('MEDIA_ENGINE_SHIKIMORI_USER_AGENT') || 'yaneMedia',
      },
      body: JSON.stringify({
        query: schedule
          ? `query { animes(${args}, status: "ongoing") { ${fields} } }`
          : query.period === 'upcoming'
            ? `query { animes(${args}, status: "anons", season: "${now.getUTCFullYear()}_${now.getUTCFullYear() + 1}") { ${fields} } }`
            : `query { animes(${args}, status: "released", score: 6, season: "${new Date(since).getUTCFullYear()}_${now.getUTCFullYear()}") { ${fields} } ongoing: animes(${args}, status: "ongoing", score: 6) { ${fields} } }`,
      }),
    });
    if (result.errors?.length || !result.data) throw new Error('Invalid anime response');
    const groups = [result.data.ongoing ?? [], result.data.animes];
    const animes = [...new Map(groups.flat().map((anime) => [anime.id, anime])).values()];
    const items: Candidate[] = animes.flatMap((anime) => {
      const releaseDate = animeReleaseDate(anime.airedOn);
      const ongoing = anime.status === 'ongoing';
      if (!hasRussianTitle(anime.russian)) return [];
      const nextEpisodeAt = schedule ? anime.nextEpisodeAt : undefined;
      if (
        schedule &&
        (!ongoing ||
          !nextEpisodeAt ||
          !(Date.parse(nextEpisodeAt) > now.getTime()) ||
          nextEpisodeAt.slice(0, 10) > scheduleEnd)
      )
        return [];
      if (
        query.period === 'recent' &&
        ((Number(anime.score) || 0) < 6.5 ||
          (!ongoing && (!releaseDate || releaseDate < since || releaseDate > today)))
      )
        return [];
      if (query.period === 'upcoming' && releaseDate?.length === 10 && releaseDate < today)
        return [];
      const poster = anime.poster?.main2xUrl || anime.poster?.mainUrl;
      return [
        {
          providerId: anime.id,
          mediaRef: '',
          slug: '',
          type: 'anime',
          title: anime.russian,
          originalTitle: anime.name,
          genres: [],
          year: anime.airedOn?.year,
          releaseDate,
          nextEpisodeAt,
          poster: poster ? this.poster(poster) : undefined,
          rating: Number(anime.score) > 0 ? { value: Number(anime.score), scale: 10 } : undefined,
        },
      ];
    });
    if (query.period === 'recent') {
      items.sort(
        (first, second) =>
          Number((second.releaseDate ?? '') >= since) - Number((first.releaseDate ?? '') >= since),
      );
    }
    return {
      items,
      hasMore: groups.some((group) => group.length === 20) && query.page < 50,
      partial: false,
    };
  }

  private async films(query: ReleasesQueryDto, now: Date) {
    const movie = query.type === 'movie';
    const schedule = query.period === 'schedule';
    const result = await this.tmdb<{ results: TmdbItem[]; total_pages: number }>(
      `discover/${movie ? 'movie' : 'tv'}`,
      tmdbReleaseParams(query, now),
    );
    const items: Candidate[] = result.results
      .filter((item) => hasRussianTitle(item.title || item.name))
      .map((item) => ({
        providerId: String(item.id),
        mediaRef: '',
        slug: '',
        type: query.type,
        title: (item.title || item.name)!,
        originalTitle: item.original_title || item.original_name,
        genres: [],
        releaseDate: item.release_date || item.first_air_date,
        year: Number((item.release_date || item.first_air_date)?.slice(0, 4)) || undefined,
        poster: item.poster_path
          ? this.poster(`https://image.tmdb.org/t/p/w500${item.poster_path}`)
          : undefined,
        rating: item.vote_average
          ? { value: Math.round(item.vote_average * 10) / 10, scale: 10 }
          : undefined,
      }));
    let partial = false;
    const deadline = AbortSignal.timeout(12_000);
    const today = dateAfterDays(now, 0);
    const scheduleEnd = dateAfterDays(now, SCHEDULE_DAYS);
    // Keep enrichment within the shared request budget.
    for (let start = 0; start < items.length; start += 3) {
      await Promise.all(
        items.slice(start, start + 3).map(async (item) => {
          try {
            const details = await this.tmdb<{
              imdb_id?: string;
              external_ids?: { imdb_id?: string };
              next_episode_to_air?: { air_date?: string };
            }>(
              `${movie ? 'movie' : 'tv'}/${item.providerId}`,
              new URLSearchParams({ append_to_response: 'external_ids' }),
              deadline,
            );
            item.imdb = details.imdb_id || details.external_ids?.imdb_id;
            const date = details.next_episode_to_air?.air_date;
            if (
              schedule &&
              date &&
              /^\d{4}-\d{2}-\d{2}$/.test(date) &&
              date >= today &&
              date <= scheduleEnd
            ) {
              item.nextEpisodeAt = date;
            }
          } catch {
            partial = true;
          }
        }),
      );
    }
    return {
      items: schedule ? items.filter((item) => item.nextEpisodeAt) : items,
      hasMore: query.page < Math.min(result.total_pages, 50),
      partial,
    };
  }

  private async load(query: ReleasesQueryDto): Promise<ReleasePage> {
    const now = new Date();
    const page = await (query.type === 'anime' ? this.anime(query, now) : this.films(query, now));
    const registered: ReleaseItem[] = [];
    for (const { providerId, imdb, ...item } of page.items) {
      try {
        const identity = await this.registry.resolveOrCreate({
          type: query.type,
          ids:
            query.type === 'anime'
              ? { shikimori: providerId }
              : imdb
                ? { imdb }
                : { tmdb: providerId },
          title: item.title,
          originalTitle: item.originalTitle,
          year: item.year,
        });
        registered.push({ ...item, mediaRef: identity.mediaRef, slug: identity.slug });
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        page.partial = true;
      }
    }
    return { ...page, items: registered };
  }
}
