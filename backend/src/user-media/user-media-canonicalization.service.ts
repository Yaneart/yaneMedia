import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MediaCatalogService } from '../media/catalog/media-catalog.service';
import { MediaRegistryService } from '../media/registry/media-registry.service';
import { canonicalizeUserMedia, type MediaRefMapping } from './user-media-canonicalization';

@Injectable()
export class UserMediaCanonicalizationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mediaRegistry: MediaRegistryService,
    private readonly mediaCatalog: MediaCatalogService,
  ) {}

  async canonicalize(userId: string, mediaRefs: readonly string[]): Promise<Map<string, string>> {
    const uniqueRefs = [...new Set(mediaRefs)];
    const identities = await Promise.all(
      uniqueRefs.map((mediaRef) => this.mediaRegistry.resolve(mediaRef)),
    );
    const mappings: MediaRefMapping[] = uniqueRefs.flatMap((sourceMediaRef, index) => {
      const canonicalMediaRef = identities[index]?.mediaRef;
      return canonicalMediaRef ? [{ sourceMediaRef, canonicalMediaRef }] : [];
    });

    await canonicalizeUserMedia(this.databaseService.db, mappings, userId);
    return new Map(
      mappings.map(({ sourceMediaRef, canonicalMediaRef }) => [sourceMediaRef, canonicalMediaRef]),
    );
  }

  async canonicalizeRegistered(
    userId: string,
    mediaRefs: readonly string[],
  ): Promise<Map<string, string>> {
    let canonicalRefs = await this.canonicalize(userId, mediaRefs);
    const unresolvedRefs = mediaRefs.filter((mediaRef) => !canonicalRefs.has(mediaRef));
    if (unresolvedRefs.length === 0) return canonicalRefs;

    await this.mediaCatalog.assertMediaRefsExist(unresolvedRefs);
    canonicalRefs = await this.canonicalize(userId, mediaRefs);
    if (mediaRefs.some((mediaRef) => !canonicalRefs.has(mediaRef))) {
      throw new NotFoundException('Canonical media identity is unavailable');
    }
    return canonicalRefs;
  }
}
