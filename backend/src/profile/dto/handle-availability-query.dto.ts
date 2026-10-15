import { Transform } from 'class-transformer';
import { IsNotIn, IsString, Matches } from 'class-validator';
import { HANDLE_PATTERN, normalizeHandle, RESERVED_HANDLES } from '../../users/handle';

export class HandleAvailabilityQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeHandle(value) : value,
  )
  @IsString()
  @Matches(HANDLE_PATTERN)
  @IsNotIn(RESERVED_HANDLES)
  handle!: string;
}
