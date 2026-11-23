import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import type { MediaRefType } from '../media-ref';

export class ReleasesQueryDto {
  @IsIn(['movie', 'series', 'anime'])
  type: MediaRefType = 'movie';

  @IsIn(['recent', 'upcoming', 'schedule'])
  period: 'recent' | 'upcoming' | 'schedule' = 'recent';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page = 1;
}
