import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { HandleAvailabilityQueryDto } from '../../src/profile/dto/handle-availability-query.dto';
import { UpdateProfileSettingsDto } from '../../src/profile/dto/update-profile-settings.dto';
import { UpdateProfileDto } from '../../src/profile/dto/update-profile.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function transform<T extends object>(metatype: new () => T, value: unknown): Promise<T> {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('profile DTOs', () => {
  it('normalizes editable profile fields', async () => {
    await expect(
      transform(UpdateProfileDto, {
        displayName: '  Артём   Яне  ',
        handle: '  Yane_Art ',
        bio: '  Люблю   хорошее кино.  ',
      }),
    ).resolves.toEqual({
      displayName: 'Артём Яне',
      handle: 'yane_art',
      bio: 'Люблю хорошее кино.',
    });
  });

  it.each([
    { displayName: 'a' },
    { displayName: 'a'.repeat(51) },
    { handle: 'ab' },
    { handle: 'contains-dash' },
    { handle: 'profile' },
    { bio: 'a'.repeat(301) },
    { bio: null },
    { email: 'replacement@example.com' },
  ])('rejects an invalid or unknown profile field: %j', async (value) => {
    await expect(transform(UpdateProfileDto, value)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts partial visibility settings and rejects unknown values', async () => {
    await expect(
      transform(UpdateProfileSettingsDto, { ratingsVisibility: 'public' }),
    ).resolves.toEqual({ ratingsVisibility: 'public' });
    await expect(
      transform(UpdateProfileSettingsDto, { favoritesVisibility: 'friends' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes a valid availability query and rejects reserved handles', async () => {
    await expect(
      transform(HandleAvailabilityQueryDto, { handle: '  Available_Name ' }),
    ).resolves.toEqual({ handle: 'available_name' });
    await expect(
      transform(HandleAvailabilityQueryDto, { handle: 'settings' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
