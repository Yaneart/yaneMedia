import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { UserMediaCanonicalizationService } from './user-media-canonicalization.service';

@Module({
  imports: [DatabaseModule, MediaModule],
  providers: [UserMediaCanonicalizationService],
  exports: [UserMediaCanonicalizationService],
})
export class UserMediaModule {}
