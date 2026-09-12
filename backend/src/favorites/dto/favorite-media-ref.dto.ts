import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

export const FAVORITES_BATCH_LIMIT = 100;

export class AddFavoritesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FAVORITES_BATCH_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(MEDIA_REF_PATTERN, { each: true })
  mediaRefs!: string[];
}

export class FavoriteMediaRefDto {
  @IsString()
  @Matches(MEDIA_REF_PATTERN)
  mediaRef!: string;
}
