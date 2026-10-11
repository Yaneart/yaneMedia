import { Transform } from 'class-transformer';
import { IsNotIn, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { HANDLE_PATTERN, normalizeHandle, RESERVED_HANDLES } from '../../users/handle';

const whenPresent = (_object: unknown, value: unknown) => value !== undefined;

export class UpdateProfileDto {
  @ValidateIf(whenPresent)
  @Transform(({ value }: { value: unknown }) => normalizeText(value))
  @IsString()
  @Length(2, 50)
  displayName?: string;

  @ValidateIf(whenPresent)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeHandle(value) : value,
  )
  @IsString()
  @Matches(HANDLE_PATTERN)
  @IsNotIn(RESERVED_HANDLES)
  handle?: string;

  @ValidateIf(whenPresent)
  @Transform(({ value }: { value: unknown }) => normalizeText(value))
  @IsString()
  @Length(0, 300)
  bio?: string;
}

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value;
}
