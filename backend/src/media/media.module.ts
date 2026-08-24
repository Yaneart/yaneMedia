import { Module } from '@nestjs/common';
import { MediaSearchService } from './application/media-search.service';
import { MediaEngineModule } from '../integrations/media-engine/media-engine.module';

@Module({
  imports: [MediaEngineModule],
  providers: [MediaSearchService],
})
export class MediaModule {}
