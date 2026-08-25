import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaSearchQueryDto } from './dto/media-search-query.dto';
import type { MediaSummaryDto } from './dto/media-summary.dto';
import type { MediaDetailsResponseDto } from './dto/media-details-response.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('search')
  search(@Query() query: MediaSearchQueryDto): Promise<MediaSummaryDto[]> {
    return this.mediaService.searchByTitle(query.query);
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
}
