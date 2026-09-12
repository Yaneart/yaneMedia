import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';
import { MEDIA_REF_PATTERN } from '../../media-ref';

export const MEDIA_SUMMARY_RESOLUTION_LIMIT = 100;

export class MediaSummaryResolutionRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MEDIA_SUMMARY_RESOLUTION_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(MEDIA_REF_PATTERN, { each: true })
  mediaRefs!: string[];
}
