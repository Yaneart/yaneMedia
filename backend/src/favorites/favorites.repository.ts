import { Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
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
}
