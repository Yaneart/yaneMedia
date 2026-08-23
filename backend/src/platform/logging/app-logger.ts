import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class AppLogger {
  private readonly logger = new ConsoleLogger({ json: true });

  logUnexpectedError(context: string): void {
    this.logger.error('Unexpected application error', context);
  }
}
