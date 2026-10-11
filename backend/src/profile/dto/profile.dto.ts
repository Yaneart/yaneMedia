export class ProfileCountsDto {
  reviews!: number;
  comments!: number;
  ratings!: number;
  favorites!: number;
}

export class ProfileVisibilityDto {
  ratings!: boolean;
  favorites!: boolean;
}

export class PrivateProfileDto {
  handle!: string;
  displayName!: string;
  avatarUrl!: string | null;
  bio!: string;
  joinedAt!: string;
  visibility!: ProfileVisibilityDto;
  counts!: ProfileCountsDto;
  email!: string;
  emailVerified!: boolean;
}

export class ProfileSettingsDto {
  ratingsVisibility!: 'public' | 'private';
  favoritesVisibility!: 'public' | 'private';
}

export class HandleAvailabilityDto {
  handle!: string;
  available!: boolean;
}
