import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { MediaRefType } from '../media-ref';

export class MediaSearchQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  query!: string;

  @IsOptional()
  @IsIn(['movie', 'series', 'anime'])
  type?: MediaRefType;
}
