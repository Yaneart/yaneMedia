import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { reviewComments } from '../comments/entities/review-comment.entity';
import { mediaComments } from '../media-comments/entities/media-comment.entity';
import { favorites } from '../favorites/entities/favorite.entity';
import { ratings } from '../ratings/entities/rating.entity';
import { reviews } from '../reviews/entities/review.entity';
import { users, type User } from '../users/entities/user.entity';
import { profileAssets, type NewProfileAsset, type ProfileAsset } from './profile-asset.entity';

export type ProfileUpdate = Partial<
  Pick<User, 'bio' | 'displayName' | 'favoritesPublic' | 'handle' | 'ratingsPublic'>
>;

export type AvatarChange = {
  user: User;
  previousAsset?: ProfileAsset;
};

export type PublicProfileRecord = Pick<
  User,
  | 'avatarAssetId'
  | 'bio'
  | 'createdAt'
  | 'displayName'
  | 'favoritesPublic'
  | 'handle'
  | 'ratingsPublic'
> & {
  favoritesCount: number | null;
  ratingsCount: number | null;
  reviewsCount: number;
  commentsCount: number;
};

export type PublicCollectionOwner = Pick<
  User,
  'id' | 'handle' | 'favoritesPublic' | 'ratingsPublic'
>;

export interface FavoritePageRow {
  mediaRef: string;
  addedAt: Date;
}

export interface RatingPageRow {
  mediaRef: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

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

  async findPublicByHandle(handle: string): Promise<PublicProfileRecord | undefined> {
    const [profile] = await this.databaseService.db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        avatarAssetId: users.avatarAssetId,
        bio: users.bio,
        createdAt: users.createdAt,
        ratingsPublic: users.ratingsPublic,
        favoritesPublic: users.favoritesPublic,
        favoritesCount: sql<number | null>`case
          when ${users.favoritesPublic} then (
            select count(*)::int from ${favorites} where ${favorites.userId} = ${users.id}
          )
          else null
        end`,
        ratingsCount: sql<number | null>`case
          when ${users.ratingsPublic} then (
            select count(*)::int from ${ratings} where ${ratings.userId} = ${users.id}
          )
          else null
        end`,
        reviewsCount: sql<number>`(
          select count(*)::int from ${reviews}
          where ${reviews.userId} = ${users.id}
            and ${reviews.publicationState} = 'published'
            and ${reviews.deletedAt} is null
        )`,
        commentsCount: sql<number>`(
          select count(*)::int from ${reviewComments} as profile_comments
          inner join ${reviews} as comment_reviews
            on comment_reviews.review_id = profile_comments.review_id
          where profile_comments.user_id = ${users.id}
            and profile_comments.publication_state = 'published'
            and profile_comments.deleted_at is null
            and comment_reviews.publication_state = 'published'
            and comment_reviews.deleted_at is null
        ) + (
          select count(*)::int from ${mediaComments} as profile_media_comments
          where profile_media_comments.user_id = ${users.id}
            and profile_media_comments.publication_state = 'published'
            and profile_media_comments.deleted_at is null
            and (
              profile_media_comments.parent_comment_id is null
              or exists (
                select 1 from ${mediaComments} as profile_media_comment_roots
                where profile_media_comment_roots.comment_id = profile_media_comments.parent_comment_id
                  and profile_media_comment_roots.publication_state = 'published'
              )
            )
        )`,
      })
      .from(users)
      .where(sql`lower(${users.handle}) = ${handle}`)
      .limit(1);

    return profile;
  }

  async findPublicCollectionOwner(handle: string): Promise<PublicCollectionOwner | undefined> {
    const [owner] = await this.databaseService.db
      .select({
        id: users.id,
        handle: users.handle,
        ratingsPublic: users.ratingsPublic,
        favoritesPublic: users.favoritesPublic,
      })
      .from(users)
      .where(sql`lower(${users.handle}) = ${handle}`)
      .limit(1);

    return owner;
  }

  async findPublicFavoritesPage(
    userId: string,
    boundary: FavoritePageRow | undefined,
    limit: number,
  ): Promise<FavoritePageRow[]> {
    return this.databaseService.db
      .select({ mediaRef: favorites.mediaRef, addedAt: favorites.addedAt })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          boundary
            ? or(
                lt(favorites.addedAt, boundary.addedAt),
                and(
                  eq(favorites.addedAt, boundary.addedAt),
                  lt(favorites.mediaRef, boundary.mediaRef),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(favorites.addedAt), desc(favorites.mediaRef))
      .limit(limit);
  }

  async findRatingsPage(
    userId: string,
    boundary: FavoritePageRow | undefined,
    limit: number,
  ): Promise<RatingPageRow[]> {
    return this.databaseService.db
      .select({
        mediaRef: ratings.mediaRef,
        value: ratings.value,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
      })
      .from(ratings)
      .where(
        and(
          eq(ratings.userId, userId),
          boundary
            ? or(
                lt(ratings.createdAt, boundary.addedAt),
                and(
                  eq(ratings.createdAt, boundary.addedAt),
                  lt(ratings.mediaRef, boundary.mediaRef),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(ratings.createdAt), desc(ratings.mediaRef))
      .limit(limit);
  }

  async countFavorites(userId: string): Promise<number> {
    const [result] = await this.databaseService.db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.userId, userId));

    return result?.value ?? 0;
  }

  async countRatings(userId: string): Promise<number> {
    const [result] = await this.databaseService.db
      .select({ value: count() })
      .from(ratings)
      .where(eq(ratings.userId, userId));

    return result?.value ?? 0;
  }

  async countReviews(userId: string): Promise<number> {
    const [result] = await this.databaseService.db
      .select({ value: count() })
      .from(reviews)
      .where(and(eq(reviews.userId, userId), isNull(reviews.deletedAt)));

    return result?.value ?? 0;
  }

  async countComments(userId: string): Promise<number> {
    const [reviewResult, mediaResult] = await Promise.all([
      this.databaseService.db
        .select({ value: count() })
        .from(reviewComments)
        .where(and(eq(reviewComments.userId, userId), isNull(reviewComments.deletedAt))),
      this.databaseService.db
        .select({ value: count() })
        .from(mediaComments)
        .where(and(eq(mediaComments.userId, userId), isNull(mediaComments.deletedAt))),
    ]);

    return (reviewResult[0]?.value ?? 0) + (mediaResult[0]?.value ?? 0);
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

  async replaceAvatar(userId: string, asset: NewProfileAsset): Promise<AvatarChange | undefined> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ avatarAssetId: users.avatarAssetId })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!current) return undefined;

      await transaction.insert(profileAssets).values(asset);
      const [user] = await transaction
        .update(users)
        .set({ avatarAssetId: asset.id, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!user) throw new Error('Locked user disappeared while replacing avatar');

      return {
        user,
        previousAsset: current.avatarAssetId
          ? await findAsset(transaction, current.avatarAssetId)
          : undefined,
      };
    });
  }

  async clearAvatar(userId: string): Promise<AvatarChange | undefined> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ avatarAssetId: users.avatarAssetId })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!current) return undefined;

      const [user] = current.avatarAssetId
        ? await transaction
            .update(users)
            .set({ avatarAssetId: null, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning()
        : await transaction.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error('Locked user disappeared while clearing avatar');

      return {
        user,
        previousAsset: current.avatarAssetId
          ? await findAsset(transaction, current.avatarAssetId)
          : undefined,
      };
    });
  }

  async findAssetByObjectKey(objectKey: string): Promise<ProfileAsset | undefined> {
    const [asset] = await this.databaseService.db
      .select()
      .from(profileAssets)
      .where(eq(profileAssets.objectKey, objectKey))
      .limit(1);
    return asset;
  }

  async findUnreferencedAssets(cutoff: Date): Promise<ProfileAsset[]> {
    return this.databaseService.db
      .select()
      .from(profileAssets)
      .where(
        and(
          lte(profileAssets.createdAt, cutoff),
          sql`not exists (select 1 from ${users} where ${users.avatarAssetId} = ${profileAssets.id})`,
        ),
      );
  }

  async findAssetObjectKeys(): Promise<string[]> {
    return this.databaseService.db
      .select({ objectKey: profileAssets.objectKey })
      .from(profileAssets)
      .then((rows) => rows.map(({ objectKey }) => objectKey));
  }

  async deleteAssetIfUnreferenced(assetId: string): Promise<boolean> {
    const deleted = await this.databaseService.db
      .delete(profileAssets)
      .where(
        and(
          eq(profileAssets.id, assetId),
          sql`not exists (select 1 from ${users} where ${users.avatarAssetId} = ${profileAssets.id})`,
        ),
      )
      .returning({ id: profileAssets.id });
    return deleted.length > 0;
  }
}

type ProfileTransaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

async function findAsset(
  transaction: ProfileTransaction,
  assetId: string,
): Promise<ProfileAsset | undefined> {
  const [asset] = await transaction
    .select()
    .from(profileAssets)
    .where(eq(profileAssets.id, assetId))
    .limit(1);
  return asset;
}
