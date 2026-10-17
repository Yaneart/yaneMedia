import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { TorrServerClient } from '../torrent/torrserver.client';

@Controller('health')
export class HealthController {
  constructor(private readonly torrServer: TorrServerClient) {}

  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    try {
      await this.torrServer.checkReady(AbortSignal.timeout(5_000));
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A required service is unavailable',
      });
    }
  }
}
