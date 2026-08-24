import { Inject, Injectable } from '@nestjs/common';
import { MEDIA_SEARCH_PORT, type MediaSearchPort } from './ports/media-search.port';

@Injectable()
export class MediaSearchService {
  constructor(
    @Inject(MEDIA_SEARCH_PORT)
    private readonly mediaSearchPort: MediaSearchPort,
  ) {}

  searchByTitle(title: string): Promise<unknown> {
    return this.mediaSearchPort.searchByTitle(title);
  }
}
