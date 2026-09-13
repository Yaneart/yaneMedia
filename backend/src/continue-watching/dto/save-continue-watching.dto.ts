import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

export class ContinueWatchingMediaRefDto {
  @IsString()
  @Matches(MEDIA_REF_PATTERN)
  mediaRef!: string;
}

export class SaveContinueWatchingEpisodeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  seasonNumber?: number;

  @IsInt()
  @Min(0)
  episodeNumber!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  absoluteEpisodeNumber?: number;
}

export class SaveContinueWatchingDto {
  @IsString()
  @Length(1, 512)
  sourceRef!: string;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => SaveContinueWatchingEpisodeDto)
  episode!: SaveContinueWatchingEpisodeDto | null;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  positionSeconds!: number;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  durationSeconds!: number | null;
}
