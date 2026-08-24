import { Controller, Get, Query } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaSearchQueryDto } from './dto/media-search-query.dto';
import type { MediaSummaryDto } from './dto/media-summary.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('search')
  search(@Query() query: MediaSearchQueryDto): Promise<MediaSummaryDto[]> {
    return this.mediaService.searchByTitle(query.query);
  }
}
