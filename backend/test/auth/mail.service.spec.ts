import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../src/mail/mail.service';
import { appConfigValidationSchema } from '../../src/config/config.module';

describe('Optional email configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
    FRONTEND_ORIGIN: 'http://localhost:5173',
  };

  it.each([
    {},
    { RESEND_API_KEY: '', MAIL_FROM: '' },
    { RESEND_API_KEY: 're_test' },
    { MAIL_FROM: 'mail@example.com' },
  ])('allows startup with missing or incomplete mail settings: %j', (settings) => {
    expect(appConfigValidationSchema.validate({ ...base, ...settings }).error).toBeUndefined();
    const service = new MailService(
      new ConfigService({ RESEND_API_KEY: '', MAIL_FROM: '', ...settings }),
    );
    expect(() => service.ensureConfigured()).toThrow(ServiceUnavailableException);
  });

  it('fails explicitly instead of silently dropping verification and password reset emails', async () => {
    const service = new MailService(new ConfigService({ RESEND_API_KEY: '', MAIL_FROM: '' }));
    await expect(
      service.sendVerificationEmail('user@example.com', 'http://localhost:5173/verify-email'),
    ).rejects.toThrow('Отправка писем не настроена.');
    await expect(
      service.sendPasswordResetEmail('user@example.com', 'http://localhost:5173/reset-password'),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('MailService password reset delivery', () => {
  interface MailPayload {
    from: string;
    to: string;
    subject: string;
    text: string;
  }

  const send = jest.fn<
    Promise<{ data: { id: string } | null; error: { name: string } | null }>,
    [MailPayload]
  >();
  const service = new MailService(
    new ConfigService({
      MAIL_FROM: 'yaneMedia <mail@yanemedia.example>',
      RESEND_API_KEY: 're_test',
    }),
  );

  beforeAll(() => {
    Object.assign(service, { resend: { emails: { send } } });
  });

  beforeEach(() => send.mockReset().mockResolvedValue({ data: { id: 'email-id' }, error: null }));

  afterEach(() => jest.restoreAllMocks());

  it('sends the one-hour, one-use recovery link through Resend', async () => {
    const resetUrl = 'https://yanemedia.example/reset-password#token=secret';
    await expect(service.sendPasswordResetEmail('artem@example.com', resetUrl)).resolves.toBe(
      undefined,
    );

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: 'yaneMedia <mail@yanemedia.example>',
      to: 'artem@example.com',
      subject: 'Сброс пароля в yaneMedia',
    });
    expect(payload.text).toContain(resetUrl);
    expect(payload.text).toContain('действует один час');
    expect(payload.text).toContain('только один раз');
  });

  it('maps a Resend rejection to a retryable service error', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    send.mockResolvedValue({ data: null, error: { name: 'validation_error' } });
    await expect(
      service.sendPasswordResetEmail('artem@example.com', 'https://yanemedia.example/reset'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(logError).toHaveBeenCalledWith('Resend: validation_error');
  });
});
