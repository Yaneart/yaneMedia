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
  seasonNumber?: number;
}
export interface ReleasePage<Item extends ReleaseItem = ReleaseItem> {
  items: Item[];
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
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
}
interface TmdbSeason {
  season_number: number;
  air_date?: string | null;
}
interface TmdbEpisode extends TmdbSeason {
  episode_number?: number;
}
interface TmdbDetails {
  imdb_id?: string;
  external_ids?: { imdb_id?: string };
  genres?: { id: number }[];
  keywords?: { results?: { id: number }[] };
  seasons?: (TmdbSeason & { episode_count?: number })[];
  last_episode_to_air?: TmdbEpisode | null;
  next_episode_to_air?: TmdbEpisode | null;
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
type RankedRelease = ReleaseItem & { popularity?: number };
type Candidate = RankedRelease & { providerId: string; imdb?: string };
type RecentBand = 'last-month' | 'older';

const SCHEDULE_DAYS = 30;
const ANIMATION_GENRE = 16;
const KIDS_GENRE = 10762;
// TMDB keywords for cartoon, anime, children cartoon, animation and animated series.
const ANIMATION_KEYWORDS = [6513, 210024, 249004, 297442, 362680, 362683];
const PUPPET_KEYWORDS = [6300, 165493, 303628];
const UPCOMING_MIN_POPULARITY = 5;
const SCHEDULE_MIN_POPULARITY = 20;
const SCHEDULE_MIN_VOTES = 20;
// Keep seasons with at most a full year of weekly episodes.
const SCHEDULE_MAX_SEASON_EPISODES = 52;
const dateAfterDays = (now: Date, days: number) =>
  new Date(now.getTime() + days * 86400_000).toISOString().slice(0, 10);
const moscowDateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow',
  dateStyle: 'short',
});
const moscowDateAfterDays = (now: Date, days: number) =>
  moscowDateFormat.format(new Date(now.getTime() + days * 86400_000));

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
  return Number.isFinite(timestamp) ? moscowDateFormat.format(timestamp) : '';
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

function monthsBefore(today: string, months: number) {
  const [year, month, day] = today.split('-').map(Number);
  const targetMonth = month - 1 - months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return dateAfterDays(new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))), 0);
}

function tmdbReleaseWindow(query: ReleasesQueryDto, now: Date) {
  if (query.period === 'schedule')
    return [moscowDateAfterDays(now, 0), moscowDateAfterDays(now, SCHEDULE_DAYS)];
  if (query.period === 'upcoming')
    return [moscowDateAfterDays(now, 1), moscowDateAfterDays(now, 180)];
  const today = moscowDateAfterDays(now, 0);
  if (query.type === 'series') return [moscowDateAfterDays(now, -90), today];
  return [monthsBefore(today, 12), today];
}

export function tmdbReleaseParams(
  query: ReleasesQueryDto,
  now: Date,
  { firstSeason = false, band }: { firstSeason?: boolean; band?: RecentBand } = {},
): URLSearchParams {
  const recent = query.period === 'recent';
  const schedule = query.period === 'schedule';
  const movie = query.type === 'movie';
  const field = movie ? 'primary_release_date' : firstSeason ? 'first_air_date' : 'air_date';
  const [from, through] = tmdbReleaseWindow(query, now);
  const monthStart = band ? monthsBefore(through, 1) : through;
  const params = new URLSearchParams({
    page: String(query.page),
    include_adult: 'false',
    sort_by: recent ? 'vote_average.desc' : 'popularity.desc',
  });
  params.set(`${field}.gte`, band === 'last-month' ? monthStart : from);
  // A returning season can still have current episodes, so the older TV query keeps the full air-date range.
  const end = band === 'older' && movie ? dateAfterDays(new Date(monthStart), -1) : through;
  params.set(`${field}.lte`, end);
  if (recent) {
    params.set('vote_average.gte', '6.5');
    params.set('vote_count.gte', movie ? '30' : '50');
  }
  if (schedule) params.set('vote_count.gte', String(SCHEDULE_MIN_VOTES));
  if (movie) {
    params.set('without_genres', String(ANIMATION_GENRE));
  } else {
    params.set('without_genres', `${ANIMATION_GENRE}|10763|10764|10766|10767`);
    if (recent || schedule) params.set('without_keywords', ANIMATION_KEYWORDS.join('|'));
    if (!firstSeason && !schedule) params.set('first_air_date.lte', moscowDateAfterDays(now, 0));
  }
  return params;
}

function hasExcludedSeriesKeywords(details?: TmdbDetails) {
  const keywords = details?.keywords?.results ?? [];
  return (
    keywords.some(({ id }) => ANIMATION_KEYWORDS.includes(id)) ||
    (details?.genres?.some(({ id }) => id === KIDS_GENRE) &&
      keywords.some(({ id }) => PUPPET_KEYWORDS.includes(id)))
  );
}

function tmdbDate(value?: string | null): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function seriesPremiere(
  firstAirDate: string | undefined,
  details: TmdbDetails | undefined,
  from: string,
  through: string,
  upcoming: boolean,
) {
  const premieres = new Map<number, string>();
  if (tmdbDate(firstAirDate)) premieres.set(1, firstAirDate);
  for (const season of details?.seasons ?? []) {
    if (season.season_number > 0 && tmdbDate(season.air_date)) {
      premieres.set(season.season_number, season.air_date);
    }
  }
  const next = details?.next_episode_to_air;
  for (const episode of [details?.last_episode_to_air, next]) {
    if (
      episode &&
      episode.episode_number === 1 &&
      episode.season_number > 0 &&
      tmdbDate(episode.air_date)
    ) {
      premieres.set(episode.season_number, episode.air_date);
    }
  }
  return [...premieres]
    .filter(
      ([season, date]) =>
        date <= through &&
        (date >= from ||
          (!upcoming &&
            next?.season_number === season &&
            tmdbDate(next.air_date) &&
            next.air_date >= through)),
    )
    .sort((first, second) =>
      upcoming ? first[1].localeCompare(second[1]) : second[1].localeCompare(first[1]),
    )[0];
}

function compareTmdbDates(first: RankedRelease, second: RankedRelease) {
  return (
    (first.nextEpisodeAt ?? first.releaseDate ?? '').localeCompare(
      second.nextEpisodeAt ?? second.releaseDate ?? '',
    ) || (second.popularity ?? 0) - (first.popularity ?? 0)
  );
}

@Injectable()
export class ReleasesService {
  private readonly cache = new Map<
    string,
    { expires: number; value: ReleasePage<RankedRelease> }
  >();
  private readonly pending = new Map<string, Promise<ReleasePage<RankedRelease>>>();

  constructor(
    private readonly config: ConfigService,
    private readonly registry: MediaRegistryService,
    private readonly egress?: MediaEgress,
    private readonly artwork?: ExternalArtworkService,
  ) {}

  async getReleases(query: ReleasesQueryDto): Promise<ReleasePage> {
    if (query.type === 'movie' && query.period === 'schedule') {
      throw new BadRequestException('Episode schedules are available for series and anime');
    }
    const now = new Date();
    const deadline = now.getTime() + 30_000;
    const fetchPage = (band?: RecentBand) => (page: number) => {
      if (Date.now() > deadline) {
        throw new ServiceUnavailableException('Releases are temporarily unavailable');
      }
      return this.getProviderPage({ ...query, page }, now, band);
    };
    const recent = query.type !== 'anime' && query.period === 'recent';
    const { items, ...page } = await paginateReleases<RankedRelease>(
      query.page,
      recent ? [fetchPage('last-month'), fetchPage('older')] : fetchPage(),
      query.type === 'anime'
        ? animeReleaseOrder[query.period]
        : recent
          ? undefined
          : compareTmdbDates,
    );
    return { ...page, items: items.map(({ popularity, ...item }) => item) };
  }

  private getProviderPage(
    query: ReleasesQueryDto,
    now: Date,
    band?: RecentBand,
  ): Promise<ReleasePage<RankedRelease>> {
    const day = moscowDateAfterDays(now, 0);
    const key = `${query.type}:${query.period}:${band ?? ''}:${query.page}:${day}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.load(query, now, band)
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
    const since = moscowDateAfterDays(now, -90);
    const today = moscowDateAfterDays(now, 0);
    const year = Number(today.slice(0, 4));
    const scheduleEnd = moscowDateAfterDays(now, SCHEDULE_DAYS);
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

  private async films(query: ReleasesQueryDto, now: Date, band?: RecentBand) {
    const movie = query.type === 'movie';
    const schedule = query.period === 'schedule';
    const upcoming = query.period === 'upcoming';
    const filterKeywords = !movie && !upcoming;
    const filterPopularity = upcoming || schedule;
    const minPopularity = schedule ? SCHEDULE_MIN_POPULARITY : UPCOMING_MIN_POPULARITY;
    const type = movie ? 'movie' : 'tv';
    const [from, through] = tmdbReleaseWindow(query, now);
    const monthStart = band ? monthsBefore(through, 1) : through;
    const inBand = (date: string) => !band || date >= monthStart === (band === 'last-month');
    const results = await Promise.all(
      (upcoming && !movie ? [false, true] : [false]).map((firstSeason) =>
        this.tmdb<{ results: TmdbItem[]; total_pages: number }>(
          `discover/${type}`,
          tmdbReleaseParams(query, now, { firstSeason, band }),
        ),
      ),
    );
    const popularEnough = (item?: TmdbItem) => (item?.popularity ?? 0) >= minPopularity;
    const items: Candidate[] = results
      .flatMap((result) => result.results)
      .filter(
        (item) =>
          hasRussianTitle(item.title || item.name) &&
          !item.genre_ids?.includes(ANIMATION_GENRE) &&
          (!filterPopularity || popularEnough(item)) &&
          (!schedule || (item.vote_count ?? 0) >= SCHEDULE_MIN_VOTES) &&
          (!movie ||
            (tmdbDate(item.release_date) &&
              item.release_date >= from &&
              item.release_date <= through &&
              inBand(item.release_date))),
      )
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
        popularity: filterPopularity ? item.popularity : undefined,
        poster: item.poster_path
          ? this.poster(`https://image.tmdb.org/t/p/w500${item.poster_path}`)
          : undefined,
        rating: item.vote_average
          ? { value: Math.round(item.vote_average * 10) / 10, scale: 10 }
          : undefined,
      }));
    let partial = false;
    const deadline = AbortSignal.timeout(12_000);
    const eligible: Candidate[] = [];
    const concurrency = filterPopularity || filterKeywords ? 6 : 3;
    for (let start = 0; start < items.length; start += concurrency) {
      const batch = await Promise.all(
        items.slice(start, start + concurrency).map(async (item) => {
          let details: TmdbDetails | undefined;
          try {
            details = await this.tmdb<TmdbDetails>(
              `${type}/${item.providerId}`,
              new URLSearchParams({
                append_to_response: filterKeywords ? 'external_ids,keywords' : 'external_ids',
              }),
              deadline,
            );
          } catch {
            partial = true;
          }
          item.imdb = details?.imdb_id || details?.external_ids?.imdb_id;
          if (details?.genres?.some(({ id }) => id === ANIMATION_GENRE)) return undefined;
          if (filterKeywords && hasExcludedSeriesKeywords(details)) return undefined;
          if (schedule) {
            const episode =
              details?.last_episode_to_air?.air_date === from
                ? details.last_episode_to_air
                : details?.next_episode_to_air;
            const date = episode?.air_date;
            if (!episode || !tmdbDate(date) || date < from || date > through) return undefined;
            const season = details?.seasons?.find(
              ({ season_number }) => season_number === episode.season_number,
            );
            if (
              Math.max(season?.episode_count ?? 0, episode.episode_number ?? 0) >
              SCHEDULE_MAX_SEASON_EPISODES
            )
              return undefined;
            return { ...item, nextEpisodeAt: date };
          }
          if (movie) return item;
          const premiere = seriesPremiere(item.releaseDate, details, from, through, upcoming);
          return premiere && inBand(premiere[1])
            ? { ...item, seasonNumber: premiere[0], releaseDate: premiere[1] }
            : undefined;
        }),
      );
      for (const item of batch) {
        if (item) eligible.push(item);
      }
    }
    return {
      items: eligible,
      hasMore: results.some(
        (result) =>
          query.page < Math.min(result.total_pages, 50) &&
          (!filterPopularity || popularEnough(result.results.at(-1))),
      ),
      partial,
    };
  }

  private async load(
    query: ReleasesQueryDto,
    now: Date,
    band?: RecentBand,
  ): Promise<ReleasePage<RankedRelease>> {
    const page = await (query.type === 'anime'
      ? this.anime(query, now)
      : this.films(query, now, band));
    const registered: RankedRelease[] = [];
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
