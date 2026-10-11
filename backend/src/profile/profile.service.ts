import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { User } from '../users/entities/user.entity';
import type {
  HandleAvailabilityDto,
  PrivateProfileDto,
  ProfileSettingsDto,
} from './dto/profile.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto';
import { ProfileRepository, type ProfileUpdate } from './profile.repository';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  async getProfile(userId: string): Promise<PrivateProfileDto> {
    const [user, favoritesCount] = await Promise.all([
      this.requireUser(userId),
      this.profileRepository.countFavorites(userId),
    ]);

    return toPrivateProfile(user, favoritesCount);
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
    avatarUrl: user.avatarAssetId ? `/api/v1/profile-assets/${user.avatarAssetId}` : null,
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
