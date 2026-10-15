import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AppLogger } from './platform/logging/app-logger';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';
import { MediaModule } from './media/media.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HistoryModule } from './history/history.module';
import { ContinueWatchingModule } from './continue-watching/continue-watching.module';
import { ProfileModule } from './profile/profile.module';
import { RatingsModule } from './ratings/ratings.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ReviewCommentsModule } from './comments/review-comments.module';
import { ModerationModule } from './moderation/moderation.module';
import { MediaCommentsModule } from './media-comments/media-comments.module';

@Module({
  imports: [
    AppConfigModule,
    HealthModule,
    MediaModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    FavoritesModule,
    HistoryModule,
    ContinueWatchingModule,
    RatingsModule,
    ReviewsModule,
    ReviewCommentsModule,
    MediaCommentsModule,
    ModerationModule,
    ProfileModule,
  ],
  providers: [AppLogger, ApiExceptionFilter],
})
export class AppModule {}
