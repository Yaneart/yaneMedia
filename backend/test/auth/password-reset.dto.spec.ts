import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RequestPasswordResetDto } from '../../src/auth/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../../src/auth/dto/reset-password.dto';
import { generateToken } from '../../src/auth/token';

describe('password reset DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  it('normalizes the request email and strips unrelated input', async () => {
    await expect(
      pipe.transform(
        { email: ' ARTEM@Example.COM ', accountId: 'private' },
        { type: 'body', metatype: RequestPasswordResetDto },
      ),
    ).resolves.toEqual({ email: 'artem@example.com' });
  });

  it.each([undefined, null, 42, 'not-an-email', `${'a'.repeat(255)}@example.com`])(
    'rejects an invalid request email: %j',
    async (email) => {
      await expect(
        pipe.transform({ email }, { type: 'body', metatype: RequestPasswordResetDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('preserves the exact token and password and strips unrelated input', async () => {
    const value = { token: generateToken(), password: '  New password 123  ' };
    await expect(
      pipe.transform({ ...value, userId: 'private' }, { type: 'body', metatype: ResetPasswordDto }),
    ).resolves.toEqual(value);
  });

  it.each([
    { token: 'short', password: 'New password 123' },
    { token: '*'.repeat(43), password: 'New password 123' },
    { token: generateToken(), password: 'short' },
    { token: generateToken(), password: 'x'.repeat(129) },
  ])('rejects an invalid reset body: %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: ResetPasswordDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
