import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { ContinueWatchingController } from './continue-watching.controller';
import { ContinueWatchingRepository } from './continue-watching.repository';
import { ContinueWatchingService } from './continue-watching.service';
import { UserMediaModule } from '../user-media/user-media.module';

@Module({
  imports: [AuthModule, AppConfigModule, DatabaseModule, UserMediaModule],
  controllers: [ContinueWatchingController],
  providers: [ContinueWatchingRepository, ContinueWatchingService],
})
export class ContinueWatchingModule {}
