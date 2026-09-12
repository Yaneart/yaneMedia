import { IsString, Matches } from 'class-validator';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

export class RecordHistoryDto {
  @IsString()
  @Matches(MEDIA_REF_PATTERN)
  mediaRef!: string;
}
