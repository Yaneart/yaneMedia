import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { LoginDto } from '../../src/auth/dto/login.dto';

describe('LoginDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const valid = { email: 'artem@example.com', password: 'Example123' };

  function transform(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: LoginDto });
  }

  it('normalizes email, preserves the exact password and strips unrelated fields', async () => {
    const password = '  PaSs e\u0301  ';
    await expect(
      transform({ email: ' ARTEM@Example.COM ', password, displayName: 'Artem', role: 'admin' }),
    ).resolves.toEqual({ ...valid, password });
  });

  it('rejects a non-string email without crashing the custom transform', async () => {
    await expect(transform({ ...valid, email: 42 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a password shorter than the login contract permits', async () => {
    await expect(transform({ ...valid, password: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
