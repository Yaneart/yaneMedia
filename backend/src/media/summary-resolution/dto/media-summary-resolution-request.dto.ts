import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

const MEDIA_REF_PATTERN =
  /^(?:imdb:tt\d{7,12}|(?:kinopoisk|shikimori|anilist|myanimelist):\d{1,12})$/;

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
