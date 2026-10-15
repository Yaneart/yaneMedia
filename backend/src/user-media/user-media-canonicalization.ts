import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { continueWatchingItems } from '../continue-watching/entities/continue-watching-item.entity';
import { favorites } from '../favorites/entities/favorite.entity';
import { historyItems } from '../history/entities/history-item.entity';
import { ratings } from '../ratings/entities/rating.entity';
import { reviews } from '../reviews/entities/review.entity';
import { users } from '../users/entities/user.entity';

export interface MediaRefMapping {
  sourceMediaRef: string;
  canonicalMediaRef: string;
}

type Database = NodePgDatabase;
type UserMediaDatabase = Pick<Database, 'select' | 'delete' | 'insert' | 'update' | 'execute'>;

export async function canonicalizeUserMedia(
  database: Database,
  mappings: readonly MediaRefMapping[],
  userId?: string,
): Promise<void> {
  const grouped = new Map<string, Set<string>>();
  for (const { sourceMediaRef, canonicalMediaRef } of mappings) {
    if (sourceMediaRef === canonicalMediaRef) continue;
    const sources = grouped.get(canonicalMediaRef) ?? new Set<string>();
    sources.add(sourceMediaRef);
    grouped.set(canonicalMediaRef, sources);
  }
  if (grouped.size === 0) return;

  await database.transaction((transaction) =>
    canonicalizeUserMediaInTransaction(transaction, mappings, userId),
  );
}

export async function canonicalizeUserMediaInTransaction(
  transaction: UserMediaDatabase,
  mappings: readonly MediaRefMapping[],
  userId?: string,
): Promise<void> {
  const grouped = new Map<string, Set<string>>();
  for (const { sourceMediaRef, canonicalMediaRef } of mappings) {
    if (sourceMediaRef === canonicalMediaRef) continue;
    const sources = grouped.get(canonicalMediaRef) ?? new Set<string>();
    sources.add(sourceMediaRef);
    grouped.set(canonicalMediaRef, sources);
  }
  if (grouped.size === 0) return;

  if (userId) {
    await transaction.execute(sql`select 1 from ${users} where ${users.id} = ${userId} for update`);
  }

  for (const [canonicalMediaRef, sourceRefs] of grouped) {
    const mediaRefs = [canonicalMediaRef, ...sourceRefs];
    const userCondition = userId ? eq(favorites.userId, userId) : undefined;
    const favoriteRows = await transaction
      .select()
      .from(favorites)
      .where(and(userCondition, inArray(favorites.mediaRef, mediaRefs)));
    const favoriteByUser = new Map<string, (typeof favoriteRows)[number]>();
    for (const row of favoriteRows) {
      const current = favoriteByUser.get(row.userId);
      if (!current || row.addedAt > current.addedAt) favoriteByUser.set(row.userId, row);
    }
    if (favoriteRows.length > 0) {
      await transaction
        .delete(favorites)
        .where(and(userCondition, inArray(favorites.mediaRef, mediaRefs)));
      await transaction.insert(favorites).values(
        [...favoriteByUser.values()].map((row) => ({
          userId: row.userId,
          mediaRef: canonicalMediaRef,
          addedAt: row.addedAt,
        })),
      );
    }

    const historyUserCondition = userId ? eq(historyItems.userId, userId) : undefined;
    const historyRows = await transaction
      .select()
      .from(historyItems)
      .where(and(historyUserCondition, inArray(historyItems.mediaRef, mediaRefs)));
    const historyByUser = new Map<string, (typeof historyRows)[number]>();
    for (const row of historyRows) {
      const current = historyByUser.get(row.userId);
      if (!current || row.openedAt > current.openedAt) historyByUser.set(row.userId, row);
    }
    if (historyRows.length > 0) {
      await transaction
        .delete(historyItems)
        .where(and(historyUserCondition, inArray(historyItems.mediaRef, mediaRefs)));
      await transaction.insert(historyItems).values(
        [...historyByUser.values()].map((row) => ({
          userId: row.userId,
          mediaRef: canonicalMediaRef,
          openedAt: row.openedAt,
        })),
      );
    }

    const progressUserCondition = userId ? eq(continueWatchingItems.userId, userId) : undefined;
    const progressRows = await transaction
      .select()
      .from(continueWatchingItems)
      .where(and(progressUserCondition, inArray(continueWatchingItems.mediaRef, mediaRefs)));
    const progressByUser = new Map<string, (typeof progressRows)[number]>();
    for (const row of progressRows) {
      const current = progressByUser.get(row.userId);
      if (!current || row.updatedAt > current.updatedAt) progressByUser.set(row.userId, row);
    }
    if (progressRows.length > 0) {
      await transaction
        .delete(continueWatchingItems)
        .where(and(progressUserCondition, inArray(continueWatchingItems.mediaRef, mediaRefs)));
      await transaction.insert(continueWatchingItems).values(
        [...progressByUser.values()].map((row) => ({
          ...row,
          mediaRef: canonicalMediaRef,
        })),
      );
    }

    const ratingUserCondition = userId ? eq(ratings.userId, userId) : undefined;
    const ratingRows = await transaction
      .select()
      .from(ratings)
      .where(and(ratingUserCondition, inArray(ratings.mediaRef, mediaRefs)));
    const ratingByUser = new Map<string, (typeof ratingRows)[number]>();
    for (const row of ratingRows) {
      const current = ratingByUser.get(row.userId);
      if (
        !current ||
        row.updatedAt > current.updatedAt ||
        (row.updatedAt.getTime() === current.updatedAt.getTime() &&
          row.mediaRef === canonicalMediaRef)
      ) {
        ratingByUser.set(row.userId, row);
      }
    }
    if (ratingRows.length > 0) {
      await transaction
        .delete(ratings)
        .where(and(ratingUserCondition, inArray(ratings.mediaRef, mediaRefs)));
      await transaction.insert(ratings).values(
        [...ratingByUser.values()].map((row) => ({
          ...row,
          mediaRef: canonicalMediaRef,
        })),
      );
    }

    const reviewUserCondition = userId ? eq(reviews.userId, userId) : undefined;
    const reviewRows = await transaction
      .select()
      .from(reviews)
      .where(and(reviewUserCondition, inArray(reviews.mediaRef, mediaRefs)));
    const activeReviewByUser = new Map<string, (typeof reviewRows)[number]>();
    const duplicateActiveReviewIds: string[] = [];
    for (const row of reviewRows) {
      if (!row.userId || row.deletedAt) continue;
      const current = activeReviewByUser.get(row.userId);
      if (!current) {
        activeReviewByUser.set(row.userId, row);
        continue;
      }
      const rowIsNewer =
        row.updatedAt > current.updatedAt ||
        (row.updatedAt.getTime() === current.updatedAt.getTime() &&
          row.reviewId > current.reviewId);
      duplicateActiveReviewIds.push(rowIsNewer ? current.reviewId : row.reviewId);
      if (rowIsNewer) activeReviewByUser.set(row.userId, row);
    }
    if (duplicateActiveReviewIds.length > 0) {
      await transaction
        .update(reviews)
        .set({ deletedAt: new Date() })
        .where(inArray(reviews.reviewId, duplicateActiveReviewIds));
    }
    if (reviewRows.length > 0) {
      await transaction
        .update(reviews)
        .set({ mediaRef: canonicalMediaRef })
        .where(and(reviewUserCondition, inArray(reviews.mediaRef, [...sourceRefs])));
    }
  }
}
