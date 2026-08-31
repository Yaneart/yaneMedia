import { IsIn } from 'class-validator';
import type { MediaRefType } from '../../media-ref';

const MEDIA_CATALOG_TYPES = ['movie', 'series', 'anime'] as const satisfies readonly MediaRefType[];

export class MediaCatalogQueryDto {
  @IsIn(MEDIA_CATALOG_TYPES)
  type!: MediaRefType;
}
