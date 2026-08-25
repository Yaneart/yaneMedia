import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class MediaAvailabilityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seasonNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  episodeNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  absoluteEpisodeNumber?: number;
}
