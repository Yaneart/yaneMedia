import { Inject, Injectable } from '@nestjs/common';
import type { MediaEngine, SearchResponse } from '@media-engine/core';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_ENGINE) private readonly mediaEngine: MediaEngine) {}

  searchByTitle(title: string): Promise<SearchResponse> {
    return this.mediaEngine.search({ title });
  }
}
