import { Controller, Get, Query } from '@nestjs/common';
import { PublicMetadataCache } from '../../platform/http/cache-policy';
import { ReleasesQueryDto } from './releases-query.dto';
import { ReleasesService } from './releases.service';
import type { ReleasePage } from './releases.service';

@Controller('media/releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get()
  @PublicMetadataCache()
  getReleases(@Query() query: ReleasesQueryDto): Promise<ReleasePage> {
    return this.releases.getReleases(query);
  }
}
