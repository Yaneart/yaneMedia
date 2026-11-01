import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | undefined;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('RESEND_API_KEY')?.trim();
    this.from = configService.get<string>('MAIL_FROM')?.trim() ?? '';
    this.resend = apiKey && this.from ? new Resend(apiKey) : undefined;
  }

  ensureConfigured(): void {
    this.getClient();
  }

  private getClient(): Resend {
    if (!this.resend) {
      throw new ServiceUnavailableException({
        code: 'MAIL_NOT_CONFIGURED',
        message: 'Отправка писем не настроена. Можно продолжить без аккаунта.',
      });
    }
    return this.resend;
  }

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const { error } = await this.getClient().emails.send({
      from: this.from,
      to,
      subject: 'Подтверждение email в yaneMedia',
      text: [
        'Для подтверждения email перейдите по ссылке:',
        verificationUrl,
        '',
        'Если вы не регистрировались в yaneMedia, проигнорируйте письмо.',
      ].join('\n'),
    });

    if (error) {
      this.logger.error(`Resend: ${error.name}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const { error } = await this.getClient().emails.send({
      from: this.from,
      to,
      subject: 'Сброс пароля в yaneMedia',
      text: [
        'Чтобы задать новый пароль, перейдите по ссылке:',
        resetUrl,
        '',
        'Ссылка действует один час и может быть использована только один раз.',
        'Если вы не запрашивали сброс пароля, проигнорируйте письмо.',
      ].join('\n'),
    });

    if (error) {
      this.logger.error(`Resend: ${error.name}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
  }
}
