import { Injectable } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { favorites } from '../favorites/entities/favorite.entity';
import { users, type User } from '../users/entities/user.entity';

export type ProfileUpdate = Partial<
  Pick<User, 'bio' | 'displayName' | 'favoritesPublic' | 'handle' | 'ratingsPublic'>
>;

@Injectable()
export class ProfileRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(userId: string): Promise<User | undefined> {
    const [user] = await this.databaseService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  async countFavorites(userId: string): Promise<number> {
    const [result] = await this.databaseService.db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    return result?.value ?? 0;
  }

  async isHandleAvailable(handle: string, userId: string): Promise<boolean> {
    const [result] = await this.databaseService.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.handle}) = ${handle} and ${users.id} <> ${userId}`)
      .limit(1);

    return !result;
  }

  async update(userId: string, changes: ProfileUpdate): Promise<User | undefined> {
    const [user] = await this.databaseService.db
      .update(users)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }
}
