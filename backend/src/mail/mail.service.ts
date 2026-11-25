import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { createTransport, type SendMailOptions, type Transporter } from 'nodemailer';

import { verificationEmail } from './verification-email';

const logoContentId = 'yane-logo@yanemedia';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | undefined;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('SMTP_HOST')?.trim();
    const port = configService.get<number>('SMTP_PORT', 587);
    const user = configService.get<string>('SMTP_USER')?.trim();
    const pass = configService.get<string>('SMTP_PASSWORD');
    this.from = configService.get<string>('MAIL_FROM')?.trim() ?? '';
    if (host && user && pass && this.from) {
      const secure = port === 465;
      this.transport = createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: { user, pass },
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
      });
    }
  }

  ensureConfigured(): void {
    this.getTransport();
  }

  private getTransport(): Transporter {
    if (!this.transport) {
      throw new ServiceUnavailableException({
        code: 'MAIL_NOT_CONFIGURED',
        message: 'Отправка писем не настроена. Можно продолжить без аккаунта.',
      });
    }
    return this.transport;
  }

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const content = verificationEmail(verificationUrl, logoContentId);
    await this.send(to, {
      subject: 'Подтверждение email в yaneMedia',
      ...content,
      attachments: [
        {
          filename: 'yane-logo.png',
          path: join(__dirname, '../../assets/yane-logo.png'),
          cid: logoContentId,
        },
      ],
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(to, {
      subject: 'Сброс пароля в yaneMedia',
      text: [
        'Чтобы задать новый пароль, перейдите по ссылке:',
        resetUrl,
        '',
        'Ссылка действует один час и может быть использована только один раз.',
        'Если вы не запрашивали сброс пароля, проигнорируйте письмо.',
      ].join('\n'),
    });
  }

  private async send(
    to: string,
    message: Pick<SendMailOptions, 'subject' | 'text' | 'html' | 'attachments'>,
  ): Promise<void> {
    const transport = this.getTransport();
    try {
      await transport.sendMail({ from: this.from, to, ...message });
    } catch {
      this.logger.error('SMTP delivery failed');
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
  }
}
