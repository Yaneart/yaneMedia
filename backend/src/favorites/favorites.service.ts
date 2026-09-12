import { Injectable } from '@nestjs/common';
import { FavoritesRepository } from './favorites.repository';

@Injectable()
export class FavoritesService {
  constructor(private readonly favoritesRepository: FavoritesRepository) {}

  listMediaRefs(userId: string): Promise<string[]> {
    return this.favoritesRepository.findMediaRefsByUserId(userId);
  }
}
