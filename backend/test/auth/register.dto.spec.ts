import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterDto } from '../../src/auth/dto/register.dto';

describe('RegisterDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const valid = { displayName: 'Artem', email: 'artem@example.com', password: 'Example123' };

  function transform(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: RegisterDto });
  }

  it('normalizes name/email, preserves the exact password, and strips extra fields', async () => {
    const password = '  PaSs e\u0301  ';
    await expect(
      transform({ displayName: ' Artem ', email: ' ARTEM@Example.COM ', password, role: 'admin' }),
    ).resolves.toEqual({ ...valid, password });
  });

  it.each([2, 50])('accepts a name of %i characters after trimming', async (length) => {
    const displayName = 'a'.repeat(length);
    await expect(transform({ ...valid, displayName: ` ${displayName} ` })).resolves.toEqual({
      ...valid,
      displayName,
    });
  });

  it.each([8, 128])('accepts a password of %i characters', async (length) => {
    const password = 'x'.repeat(length);
    await expect(transform({ ...valid, password })).resolves.toEqual({ ...valid, password });
  });

  it.each([
    ['displayName', ' a '],
    ['displayName', '   '],
    ['displayName', 'a'.repeat(51)],
    ['email', 'not-an-email'],
    ['email', 'a'.repeat(255) + '@example.com'],
    ['password', 'x'.repeat(7)],
    ['password', 'x'.repeat(129)],
  ])('rejects invalid %s: %j', async (field, value) => {
    await expect(transform({ ...valid, [field]: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe.each(['displayName', 'email', 'password'])('%s', (field) => {
    it.each([undefined, null, 42, {}, ['text']])(
      'rejects missing/non-string input %j',
      async (value) => {
        await expect(transform({ ...valid, [field]: value })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );
  });
});
