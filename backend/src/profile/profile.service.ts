import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { User } from '../users/entities/user.entity';
import { AppLogger } from '../platform/logging/app-logger';
import type {
  HandleAvailabilityDto,
  PrivateProfileDto,
  ProfileSettingsDto,
  PublicProfileDto,
} from './dto/profile.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto';
import { ProfileRepository, type ProfileUpdate } from './profile.repository';
import { ProfileAssetStore } from './profile-asset.store';
import { isHandleAllowed, normalizeHandle } from '../users/handle';

export type UploadedAvatar = {
  buffer: Buffer;
  mimetype: string;
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly profileAssetStore: ProfileAssetStore,
    private readonly logger: AppLogger,
  ) {}

  async getProfile(userId: string): Promise<PrivateProfileDto> {
    const [user, favoritesCount] = await Promise.all([
      this.requireUser(userId),
      this.profileRepository.countFavorites(userId),
    ]);

    return toPrivateProfile(user, favoritesCount);
  }

  async getPublicProfile(rawHandle: string): Promise<PublicProfileDto> {
    const handle = normalizeHandle(rawHandle);
    const profile = isHandleAllowed(handle)
      ? await this.profileRepository.findPublicByHandle(handle)
      : undefined;
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Публичный профиль не найден',
      });
    }

    return {
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarAssetId
        ? `/api/v1/profile-assets/avatar_${profile.avatarAssetId}.webp`
        : null,
      bio: profile.bio,
      joinedAt: profile.createdAt.toISOString(),
      visibility: {
        ratings: profile.ratingsPublic,
        favorites: profile.favoritesPublic,
      },
      counts: {
        reviews: 0,
        comments: 0,
        ratings: profile.ratingsPublic ? 0 : null,
        favorites: profile.favoritesCount,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PrivateProfileDto> {
    requireChanges(dto);

    return this.updateAndRead(userId, dto);
  }

  async getSettings(userId: string): Promise<ProfileSettingsDto> {
    return toSettings(await this.requireUser(userId));
  }

  async updateSettings(userId: string, dto: UpdateProfileSettingsDto): Promise<ProfileSettingsDto> {
    requireChanges(dto);
    const user = await this.updateUser(userId, {
      ...(dto.ratingsVisibility ? { ratingsPublic: dto.ratingsVisibility === 'public' } : {}),
      ...(dto.favoritesVisibility ? { favoritesPublic: dto.favoritesVisibility === 'public' } : {}),
    });

    return toSettings(user);
  }

  async getHandleAvailability(userId: string, handle: string): Promise<HandleAvailabilityDto> {
    return {
      handle,
      available: await this.profileRepository.isHandleAvailable(handle, userId),
    };
  }

  async updateAvatar(userId: string, upload: UploadedAvatar): Promise<PrivateProfileDto> {
    const asset = await this.profileAssetStore.save(upload.buffer, upload.mimetype);
    let change: Awaited<ReturnType<ProfileRepository['replaceAvatar']>>;
    try {
      change = await this.profileRepository.replaceAvatar(userId, asset);
    } catch (error: unknown) {
      await this.profileAssetStore.delete(asset.objectKey).catch(() => undefined);
      throw error;
    }

    if (!change) {
      await this.profileAssetStore.delete(asset.objectKey).catch(() => undefined);
      throw new Error('Authenticated user no longer exists');
    }

    await this.cleanupPreviousAsset(change.previousAsset);
    return toPrivateProfile(change.user, await this.profileRepository.countFavorites(userId));
  }

  async deleteAvatar(userId: string): Promise<PrivateProfileDto> {
    const change = await this.profileRepository.clearAvatar(userId);
    if (!change) throw new Error('Authenticated user no longer exists');

    await this.cleanupPreviousAsset(change.previousAsset);
    return toPrivateProfile(change.user, await this.profileRepository.countFavorites(userId));
  }

  private async updateAndRead(userId: string, changes: ProfileUpdate): Promise<PrivateProfileDto> {
    const user = await this.updateUser(userId, changes);
    return toPrivateProfile(user, await this.profileRepository.countFavorites(userId));
  }

  private async updateUser(userId: string, changes: ProfileUpdate): Promise<User> {
    try {
      const user = await this.profileRepository.update(userId, changes);
      if (!user) throw new Error('Authenticated user no longer exists');
      return user;
    } catch (error: unknown) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;
      if (
        cause instanceof DatabaseError &&
        cause.code === '23505' &&
        cause.constraint === 'users_handle_unique'
      ) {
        throw new ConflictException({
          code: 'HANDLE_TAKEN',
          message: 'Этот handle уже занят',
          details: {
            fields: [{ path: 'handle', code: 'HANDLE_TAKEN', message: 'Этот handle уже занят' }],
          },
        });
      }
      throw error;
    }
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.profileRepository.findById(userId);
    if (!user) throw new Error('Authenticated user no longer exists');
    return user;
  }

  private async cleanupPreviousAsset(
    asset: Awaited<ReturnType<ProfileRepository['findAssetByObjectKey']>>,
  ): Promise<void> {
    if (!asset) return;

    try {
      if (await this.profileRepository.deleteAssetIfUnreferenced(asset.id)) {
        await this.profileAssetStore.delete(asset.objectKey);
      }
    } catch {
      this.logger.logUnexpectedError('ProfileService.cleanupPreviousAsset');
    }
  }
}

function requireChanges(dto: object): void {
  if (Object.keys(dto).length === 0) {
    throw new BadRequestException('Укажите хотя бы одно поле для изменения');
  }
}

function toPrivateProfile(user: User, favoritesCount: number): PrivateProfileDto {
  return {
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarAssetId
      ? `/api/v1/profile-assets/avatar_${user.avatarAssetId}.webp`
      : null,
    bio: user.bio,
    joinedAt: user.createdAt.toISOString(),
    visibility: {
      ratings: user.ratingsPublic,
      favorites: user.favoritesPublic,
    },
    counts: { reviews: 0, comments: 0, ratings: 0, favorites: favoritesCount },
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

function toSettings(user: User): ProfileSettingsDto {
  return {
    ratingsVisibility: user.ratingsPublic ? 'public' : 'private',
    favoritesVisibility: user.favoritesPublic ? 'public' : 'private',
  };
}
