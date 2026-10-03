import { Injectable } from '@nestjs/common';
import { FavoritesRepository } from './favorites.repository';
import { UserMediaCanonicalizationService } from '../user-media/user-media-canonicalization.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly favoritesRepository: FavoritesRepository,
    private readonly userMediaCanonicalization: UserMediaCanonicalizationService,
  ) {}

  async listMediaRefs(userId: string): Promise<string[]> {
    const mediaRefs = await this.favoritesRepository.findMediaRefsByUserId(userId);
    await this.userMediaCanonicalization.canonicalize(userId, mediaRefs);
    return this.favoritesRepository.findMediaRefsByUserId(userId);
  }

  async addMediaRefs(userId: string, mediaRefs: readonly string[]): Promise<string[]> {
    const canonicalRefs = await this.userMediaCanonicalization.canonicalizeRegistered(
      userId,
      mediaRefs,
    );
    await this.favoritesRepository.addMediaRefs(
      userId,
      mediaRefs.map((mediaRef) => canonicalRefs.get(mediaRef) ?? mediaRef),
    );
    return this.listMediaRefs(userId);
  }

  async removeMediaRef(userId: string, mediaRef: string): Promise<string[]> {
    const canonicalRefs = await this.userMediaCanonicalization.canonicalize(userId, [mediaRef]);
    await this.favoritesRepository.removeMediaRef(userId, canonicalRefs.get(mediaRef) ?? mediaRef);
    return this.listMediaRefs(userId);
  }
}
