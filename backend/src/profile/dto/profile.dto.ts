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

export class PublicProfileCountsDto {
  reviews!: number;
  comments!: number;
  ratings!: number | null;
  favorites!: number | null;
}

export class PublicProfileDto {
  handle!: string;
  displayName!: string;
  avatarUrl!: string | null;
  bio!: string;
  joinedAt!: string;
  visibility!: ProfileVisibilityDto;
  counts!: PublicProfileCountsDto;
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
