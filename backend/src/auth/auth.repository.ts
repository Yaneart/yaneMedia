import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NewSession, Session, sessions } from './entities/session.entity';
import { type User, users } from '../users/entities/user.entity';
import { and, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm';
import {
  emailVerificationTokens,
  NewEmailVerificationToken,
} from './entities/email-verification-token.entity';
import { NewPasswordResetToken, passwordResetTokens } from './entities/password-reset-token.entity';

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
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, now),
          isNotNull(users.emailVerifiedAt),
        ),
      )
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

  async saveVerificationToken(data: NewEmailVerificationToken): Promise<boolean> {
    const createdAt = new Date();
    const cooldownBefore = new Date(createdAt.getTime() - 60_000);

    const [saved] = await this.databaseService.db
      .insert(emailVerificationTokens)
      .values({ ...data, createdAt })
      .onConflictDoUpdate({
        target: emailVerificationTokens.userId,
        set: {
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt,
        },
        setWhere: lte(emailVerificationTokens.createdAt, cooldownBefore),
      })
      .returning({ userId: emailVerificationTokens.userId });

    return Boolean(saved);
  }

  async verifyEmailByTokenHash(tokenHash: string, now = new Date()): Promise<boolean> {
    return this.databaseService.db.transaction(async (tx) => {
      const [token] = await tx
        .delete(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, tokenHash),
            gt(emailVerificationTokens.expiresAt, now),
          ),
        )
        .returning({ userId: emailVerificationTokens.userId });

      if (!token) {
        return false;
      }

      const [user] = await tx
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(and(eq(users.id, token.userId), isNull(users.emailVerifiedAt)))
        .returning({ id: users.id });

      return Boolean(user);
    });
  }

  async savePasswordResetToken(data: NewPasswordResetToken): Promise<boolean> {
    const createdAt = new Date();
    const cooldownBefore = new Date(createdAt.getTime() - 60_000);

    const [saved] = await this.databaseService.db
      .insert(passwordResetTokens)
      .values({ ...data, createdAt })
      .onConflictDoUpdate({
        target: passwordResetTokens.userId,
        set: {
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt,
        },
        setWhere: lte(passwordResetTokens.createdAt, cooldownBefore),
      })
      .returning({ userId: passwordResetTokens.userId });

    return Boolean(saved);
  }

  async resetPasswordByTokenHash(
    tokenHash: string,
    passwordHash: string,
    now = new Date(),
  ): Promise<boolean> {
    return this.databaseService.db.transaction(async (tx) => {
      const [token] = await tx
        .delete(passwordResetTokens)
        .where(
          and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, now)),
        )
        .returning({ userId: passwordResetTokens.userId });

      if (!token) {
        return false;
      }

      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, token.userId));
      await tx.delete(sessions).where(eq(sessions.userId, token.userId));

      return true;
    });
  }
}
