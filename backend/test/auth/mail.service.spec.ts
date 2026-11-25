import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from '../../src/mail/mail.service';
import { appConfigValidationSchema } from '../../src/config/config.module';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const settings = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'login@example.com',
  SMTP_PASSWORD: 'test-key',
  MAIL_FROM: 'yaneMedia <mail@example.com>',
};

describe('Optional email configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
    FRONTEND_ORIGIN: 'http://localhost:5173',
  };

  it.each(Object.keys(settings))('allows startup without %s', (missingKey) => {
    const incomplete = { ...settings, [missingKey]: '' };
    expect(appConfigValidationSchema.validate({ ...base, ...incomplete }).error).toBeUndefined();
    const service = new MailService(new ConfigService({ ...base, ...incomplete }));
    expect(() => service.ensureConfigured()).toThrow(ServiceUnavailableException);
  });

  it('fails explicitly instead of silently dropping verification and password reset emails', async () => {
    const service = new MailService(new ConfigService(base));
    await expect(
      service.sendVerificationEmail('user@example.com', 'http://localhost:5173/verify-email'),
    ).rejects.toThrow('Отправка писем не настроена.');
    await expect(
      service.sendPasswordResetEmail('user@example.com', 'http://localhost:5173/reset-password'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('defaults the SMTP port to 587 and rejects invalid ports', () => {
    expect(appConfigValidationSchema.validate(base).value).toMatchObject({ SMTP_PORT: 587 });
    for (const port of [0, 65536, 'smtp']) {
      expect(appConfigValidationSchema.validate({ ...base, SMTP_PORT: port }).error).toBeDefined();
    }
  });
});

describe('MailService SMTP delivery', () => {
  const sendMail = jest.fn<Promise<unknown>, [{ text: string }]>();
  const transportFactory = jest.mocked(createTransport);

  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({});
    transportFactory.mockReset().mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof createTransport>);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [587, false, true],
    [465, true, false],
  ])('requires an encrypted connection on port %i', (port, secure, requireTLS) => {
    new MailService(new ConfigService({ ...settings, SMTP_PORT: port })).ensureConfigured();
    expect(transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: settings.SMTP_HOST,
        port,
        secure,
        requireTLS,
        auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD },
      }),
    );
  });

  it('sends the confirmation link through SMTP', async () => {
    const service = new MailService(new ConfigService(settings));
    const verificationUrl = 'https://89.112.10.57/verify-email#token=secret';
    await service.sendVerificationEmail('user@example.com', verificationUrl);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: settings.MAIL_FROM,
      to: 'user@example.com',
      subject: 'Подтверждение email в yaneMedia',
    });
    expect(payload.text).toContain(verificationUrl);
  });

  it('sends the one-hour, one-use recovery link through SMTP', async () => {
    const service = new MailService(new ConfigService(settings));
    const resetUrl = 'https://yanemedia.example/reset-password#token=secret';
    await expect(service.sendPasswordResetEmail('artem@example.com', resetUrl)).resolves.toBe(
      undefined,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: settings.MAIL_FROM,
      to: 'artem@example.com',
      subject: 'Сброс пароля в yaneMedia',
    });
    expect(payload.text).toContain(resetUrl);
    expect(payload.text).toContain('действует один час');
    expect(payload.text).toContain('только один раз');
  });

  it('maps an SMTP rejection to a retryable service error without exposing its details', async () => {
    const service = new MailService(new ConfigService(settings));
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    sendMail.mockRejectedValue(new Error('SMTP rejection for user@example.com'));
    await expect(
      service.sendPasswordResetEmail('artem@example.com', 'https://yanemedia.example/reset'),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Не удалось отправить письмо. Попробуйте позже.',
    });
    expect(logError.mock.calls).toEqual([['SMTP delivery failed']]);
  });
});
