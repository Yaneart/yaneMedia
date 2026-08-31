import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class MediaCollectionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
