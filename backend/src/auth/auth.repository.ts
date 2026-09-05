import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NewSession, Session, sessions } from './entities/session.entity';
import { type User, users } from '../users/entities/user.entity';
import { and, eq, gt, lte } from 'drizzle-orm';

@Injectable()
export class AuthRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: NewSession): Promise<Session> {
    const [session] = await this.databaseService.db.insert(sessions).values(data).returning();

    if (!session) {
      throw new Error('Не удалось создать сессию');
    }

    return session;
  }

  async findUserBySessionHash(
    tokenHash: string,
    now = new Date(),
  ): Promise<Pick<User, 'id' | 'displayName' | 'email' | 'createdAt'> | undefined> {
    const [user] = await this.databaseService.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);

    return user;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.databaseService.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async deleteExpiredByTokenHash(tokenHash: string, now = new Date()): Promise<void> {
    await this.databaseService.db
      .delete(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), lte(sessions.expiresAt, now)));
  }
}
