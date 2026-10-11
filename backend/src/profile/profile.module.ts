import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { ProfileController } from './profile.controller';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from './strict-body-fields.guard';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 5, ttl: 60_000 }] }),
  ],
  controllers: [ProfileController],
  providers: [ProfileRepository, ProfileService, StrictBodyFieldsGuard, StrictQueryFieldsGuard],
})
export class ProfileModule {}
