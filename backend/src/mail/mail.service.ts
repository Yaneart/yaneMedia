import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(configService: ConfigService) {
    this.resend = new Resend(configService.getOrThrow<string>('RESEND_API_KEY'));
    this.from = configService.getOrThrow<string>('MAIL_FROM');
  }

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const { error } = await this.resend.emails.send({
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
}
