import { MediaAvailabilityQueryDto } from './dto/media-availability-query.dto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  type MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { defer, finalize, from, map, type Observable, switchMap, throwError } from 'rxjs';
import { MediaService } from './media.service';
import { MediaSearchQueryDto } from './dto/media-search-query.dto';
import { MediaAvailabilityDto } from './dto/media-availability.dto';
import type { MediaDetailsResponseDto } from './dto/media-details-response.dto';
import type { MediaSummaryDto } from './dto/media-summary.dto';
import { MediaCatalogService } from './catalog/media-catalog.service';
import { MediaCatalogQueryDto } from './catalog/dto/media-catalog-query.dto';
import type { MediaCatalogResponseDto } from './catalog/dto/media-catalog-response.dto';
import { MediaCollectionQueryDto } from './catalog/dto/media-collection-query.dto';
import type { MediaCollectionResponseDto } from './catalog/dto/media-collection-response.dto';
import type { HomeFeedDto } from './home/dto/home-feed.dto';
import { HomeFeedService } from './home/home-feed.service';
import { MediaSummaryResolutionRequestDto } from './summary-resolution/dto/media-summary-resolution-request.dto';
import type { MediaSummaryResolutionResponseDto } from './summary-resolution/dto/media-summary-resolution-response.dto';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaCatalogService: MediaCatalogService,
    private readonly homeFeedService: HomeFeedService,
  ) {}

  @Get('search')
  search(@Query() query: MediaSearchQueryDto): Promise<MediaSummaryDto[]> {
    return this.mediaService.searchByTitle(query.query, query.type);
  }

  @Get('home')
  getHome(): Promise<HomeFeedDto> {
    return this.homeFeedService.getHomeFeed();
  }

  @Get('catalog')
  getCatalog(@Query() query: MediaCatalogQueryDto): Promise<MediaCatalogResponseDto> {
    return this.mediaCatalogService.getCatalog(query.type);
  }

  @Get('collections/editorial-picks')
  getEditorialPicks(@Query() query: MediaCollectionQueryDto): Promise<MediaCollectionResponseDto> {
    return this.mediaCatalogService.getCollection('editorial-picks', query.offset, query.limit);
  }

  @Get(':mediaRef')
  async getDetails(@Param('mediaRef') mediaRef: string): Promise<MediaDetailsResponseDto> {
    const { details, meta } = await this.mediaService.getDetailsByRef(mediaRef);

    if (!details) {
      throw new NotFoundException('Media not found');
    }

    return {
      details,
      degraded:
        meta.providers.failed.length > 0 || (meta.warnings?.length ?? 0) > 0 || meta.stale === true,
    };
  }

  @Post('summaries/resolve')
  resolveMediaSummaries(
    @Body() body: MediaSummaryResolutionRequestDto,
  ): Promise<MediaSummaryResolutionResponseDto> {
    return this.mediaCatalogService.resolveMediaRefs(body.mediaRefs);
  }

  @Get(':mediaRef/availability')
  async getAvailability(
    @Param('mediaRef') mediaRef: string,
    @Query() query: MediaAvailabilityQueryDto,
    @Headers('user-agent') playbackUserAgent?: string,
  ): Promise<MediaAvailabilityDto> {
    if (query.seasonNumber !== undefined && query.episodeNumber === undefined) {
      throw new BadRequestException('episodeNumber is required when seasonNumber is provided');
    }

    const availability = await this.mediaService.getAvailabilityByRef(
      mediaRef,
      playbackUserAgent,
      query,
    );

    if (!availability) {
      throw new NotFoundException('Media not found');
    }

    return availability;
  }

  @Sse(':mediaRef/availability/stream')
  streamAvailability(
    @Param('mediaRef') mediaRef: string,
    @Query() query: MediaAvailabilityQueryDto,
    @Headers('user-agent') playbackUserAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Observable<MessageEvent> {
    if (query.seasonNumber !== undefined && query.episodeNumber === undefined) {
      throw new BadRequestException('episodeNumber is required when seasonNumber is provided');
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once('close', abort);

    return defer(() =>
      from(
        this.mediaService.getAvailabilityProgressivelyByRef(
          mediaRef,
          playbackUserAgent,
          query,
          controller.signal,
        ),
      ),
    ).pipe(
      switchMap((snapshots) =>
        snapshots ? from(snapshots) : throwError(() => new NotFoundException('Media not found')),
      ),
      map((snapshot) => ({ data: snapshot })),
      finalize(() => {
        response.off('close', abort);
        controller.abort();
      }),
    );
  }
}
