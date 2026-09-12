import { Injectable } from '@nestjs/common';
import { FavoritesRepository } from './favorites.repository';

@Injectable()
export class FavoritesService {
  constructor(private readonly favoritesRepository: FavoritesRepository) {}

  listMediaRefs(userId: string): Promise<string[]> {
    return this.favoritesRepository.findMediaRefsByUserId(userId);
  }

  async addMediaRefs(userId: string, mediaRefs: readonly string[]): Promise<string[]> {
    await this.favoritesRepository.addMediaRefs(userId, mediaRefs);
    return this.listMediaRefs(userId);
  }

  async removeMediaRef(userId: string, mediaRef: string): Promise<string[]> {
    await this.favoritesRepository.removeMediaRef(userId, mediaRef);
    return this.listMediaRefs(userId);
  }
}
