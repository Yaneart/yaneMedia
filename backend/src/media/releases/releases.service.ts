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
  kind: string;
  status: string;
  airedOn?: { year?: number; month?: number; day?: number };
  poster?: { main2xUrl?: string; mainUrl?: string };
  nextEpisodeAt?: string;
}
type Candidate = ReleaseItem & { providerId: string; imdb?: string };

const SCHEDULE_DAYS = 30;
const dateAfterDays = (now: Date, days: number) =>
  new Date(now.getTime() + days * 86400_000).toISOString().slice(0, 10);
const animeDateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow',
  dateStyle: 'short',
});
const animeDateAfterDays = (now: Date, days: number) =>
  animeDateFormat.format(new Date(now.getTime() + days * 86400_000));

function shikimoriSeason(year: number, month: number) {
  const seasons = ['winter', 'spring', 'summer', 'fall'];
  // Shikimori counts December as winter of the following year.
  return `${seasons[Math.floor((month % 12) / 3)]}_${month === 12 ? year + 1 : year}`;
}

function compareAnimePremieres(first: ReleaseItem, second: ReleaseItem) {
  const firstDate = first.releaseDate ?? '';
  const secondDate = second.releaseDate ?? '';
  if (firstDate.startsWith(secondDate) || secondDate.startsWith(firstDate)) {
    return secondDate.length - firstDate.length;
  }
  return firstDate.localeCompare(secondDate);
}

function animeScheduleDate(item: Pick<ReleaseItem, 'nextEpisodeAt' | 'releaseDate'>) {
  if (!item.nextEpisodeAt) return item.releaseDate?.length === 10 ? item.releaseDate : '';
  const timestamp = Date.parse(item.nextEpisodeAt);
  return Number.isFinite(timestamp) ? animeDateFormat.format(timestamp) : '';
}

function compareAnimeSchedule(first: ReleaseItem, second: ReleaseItem) {
  return (
    animeScheduleDate(first).localeCompare(animeScheduleDate(second)) ||
    (Date.parse(first.nextEpisodeAt ?? '') || 0) - (Date.parse(second.nextEpisodeAt ?? '') || 0)
  );
}

const animeReleaseOrder = {
  recent: (first: ReleaseItem, second: ReleaseItem) =>
    (second.rating?.value ?? 0) - (first.rating?.value ?? 0) ||
    (second.releaseDate ?? '').localeCompare(first.releaseDate ?? ''),
  upcoming: compareAnimePremieres,
  schedule: compareAnimeSchedule,
};

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
    const now = new Date();
    const deadline = now.getTime() + 30_000;
    return paginateReleases(
      query.page,
      (page) => {
        if (Date.now() > deadline) {
          throw new ServiceUnavailableException('Releases are temporarily unavailable');
        }
        return this.getProviderPage({ ...query, page }, now);
      },
      query.type === 'anime' ? animeReleaseOrder[query.period] : undefined,
    );
  }

  private getProviderPage(query: ReleasesQueryDto, now: Date): Promise<ReleasePage> {
    const day = query.type === 'anime' ? animeDateAfterDays(now, 0) : '';
    const key = `${query.type}:${query.period}:${query.page}:${day}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.load(query, now)
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
    const limit = 50;
    const fields =
      'id name russian score kind status airedOn { year month day } poster { main2xUrl mainUrl }' +
      (schedule ? ' nextEpisodeAt' : '');
    const paging = `page: ${query.page}, limit: ${limit}, censored: true`;
    const popularFormats = 'order: popularity, kind: "tv,movie"';
    const args = `${paging}, ${popularFormats}`;
    const since = animeDateAfterDays(now, -90);
    const today = animeDateAfterDays(now, 0);
    const year = Number(today.slice(0, 4));
    const scheduleEnd = animeDateAfterDays(now, SCHEDULE_DAYS);
    const season = shikimoriSeason(year, Number(today.slice(5, 7)));
    const scheduleArgs = `${paging}, season: "${season}"`;
    const result = await this.json<{
      data?: {
        animes: AnimeItem[];
        ongoing?: AnimeItem[];
        premieres?: AnimeItem[];
        movies?: AnimeItem[];
      };
      errors?: unknown[];
    }>('https://shikimori.io/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.config.get<string>('MEDIA_ENGINE_SHIKIMORI_USER_AGENT') || 'yaneMedia',
      },
      body: JSON.stringify({
        query: schedule
          ? `query {
              animes(${scheduleArgs}, ${popularFormats}, status: "ongoing") { ${fields} }
              premieres: animes(${scheduleArgs}, ${popularFormats}, status: "anons") { ${fields} }
              movies: animes(${scheduleArgs}, order: aired_on, kind: "movie", status: "released") { ${fields} }
            }`
          : query.period === 'upcoming'
            ? `query { animes(${args}, status: "anons", season: "${year}_${year + 1}") { ${fields} } }`
            : `query {
                animes(${args}, status: "released", score: 6, season: "${year}") { ${fields} }
                ongoing: animes(${args}, status: "ongoing", score: 6, season: "${year}") { ${fields} }
              }`,
      }),
    });
    if (result.errors?.length || !result.data) throw new Error('Invalid anime response');
    const { animes: primary, ongoing = [], premieres = [], movies = [] } = result.data;
    const groups = [ongoing, primary, premieres, movies];
    const animes = [...new Map(groups.flat().map((anime) => [anime.id, anime])).values()];
    const items: Candidate[] = animes.flatMap((anime) => {
      if (!hasRussianTitle(anime.russian) || (anime.kind !== 'tv' && anime.kind !== 'movie'))
        return [];
      const releaseDate = animeReleaseDate(anime.airedOn);
      const ongoing = anime.status === 'ongoing';
      const nextEpisodeAt =
        schedule && ongoing && anime.kind === 'tv' ? anime.nextEpisodeAt : undefined;
      if (schedule) {
        if (ongoing && anime.kind === 'tv' && !nextEpisodeAt) return [];
        const date = animeScheduleDate({ releaseDate, nextEpisodeAt });
        if (date < today || date > scheduleEnd) return [];
      }
      if (
        query.period === 'recent' &&
        ((Number(anime.score) || 0) < 6.5 ||
          anime.airedOn?.year !== year ||
          !releaseDate ||
          releaseDate > today ||
          (!ongoing && releaseDate < since))
      )
        return [];
      if (
        query.period === 'upcoming' &&
        releaseDate &&
        releaseDate < today.slice(0, releaseDate.length)
      )
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
    return {
      items,
      hasMore: groups.some((group) => group.length === limit) && query.page < 50,
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

  private async load(query: ReleasesQueryDto, now: Date): Promise<ReleasePage> {
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
