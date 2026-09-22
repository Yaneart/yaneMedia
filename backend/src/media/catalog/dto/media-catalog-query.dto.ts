import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import type { MediaRefType } from '../../media-ref';

const MEDIA_CATALOG_TYPES = ['movie', 'series', 'anime'] as const satisfies readonly MediaRefType[];

export class MediaCatalogQueryDto {
  @IsIn(MEDIA_CATALOG_TYPES)
  type!: MediaRefType;

  @ValidateIf(
    (query: MediaCatalogQueryDto) => query.offset !== undefined || query.limit !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ValidateIf(
    (query: MediaCatalogQueryDto) => query.offset !== undefined || query.limit !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
