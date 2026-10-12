import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { ProfileController } from './profile.controller';
import { ProfileAssetsController } from './profile-assets.controller';
import { ProfileAssetCleanupService } from './profile-asset-cleanup.service';
import { ProfileAssetStore } from './profile-asset.store';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from './strict-body-fields.guard';
import { AppLogger } from '../platform/logging/app-logger';
import { PublicProfilesController } from './public-profiles.controller';
import { MediaModule } from '../media/media.module';
import { ProfileCollectionCursorService } from './profile-collection-cursor.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    MediaModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 5, ttl: 60_000 }] }),
  ],
  controllers: [ProfileController, ProfileAssetsController, PublicProfilesController],
  providers: [
    ProfileRepository,
    ProfileService,
    ProfileAssetStore,
    ProfileAssetCleanupService,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
    AppLogger,
    ProfileCollectionCursorService,
  ],
})
export class ProfileModule {}
