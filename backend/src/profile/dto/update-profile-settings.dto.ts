import { IsIn, ValidateIf } from 'class-validator';

const VISIBILITIES = ['public', 'private'] as const;
const whenPresent = (_object: unknown, value: unknown) => value !== undefined;

export class UpdateProfileSettingsDto {
  @ValidateIf(whenPresent)
  @IsIn(VISIBILITIES)
  ratingsVisibility?: (typeof VISIBILITIES)[number];

  @ValidateIf(whenPresent)
  @IsIn(VISIBILITIES)
  favoritesVisibility?: (typeof VISIBILITIES)[number];
}
