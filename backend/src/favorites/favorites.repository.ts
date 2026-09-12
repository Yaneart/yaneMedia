import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { favorites } from './entities/favorite.entity';

@Injectable()
export class FavoritesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findMediaRefsByUserId(userId: string): Promise<string[]> {
    const rows = await this.databaseService.db
      .select({ mediaRef: favorites.mediaRef })
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.addedAt), asc(favorites.mediaRef));

    return rows.map(({ mediaRef }) => mediaRef);
  }

  async addMediaRefs(userId: string, mediaRefs: readonly string[]): Promise<void> {
    await this.databaseService.db
      .insert(favorites)
      .values(mediaRefs.map((mediaRef) => ({ userId, mediaRef })))
      .onConflictDoNothing({ target: [favorites.userId, favorites.mediaRef] });
  }

  async removeMediaRef(userId: string, mediaRef: string): Promise<void> {
    await this.databaseService.db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.mediaRef, mediaRef)));
  }
}
