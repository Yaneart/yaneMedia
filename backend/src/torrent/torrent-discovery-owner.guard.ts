import { randomBytes, createHash } from 'node:crypto';
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth-request';
import { SessionGuard } from '../auth/guards/session.guard';

export type DiscoveryRequest = AuthRequest & { discoveryOwner: string };
const cookie = 'yanemedia_discovery';

@Injectable()
export class TorrentDiscoveryOwnerGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionGuard,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DiscoveryRequest>();
    const user = await this.sessions.findUser(request.cookies?.yanemedia_session);
    if (user) {
      request.user = user;
      request.discoveryOwner = `account:${user.id}`;
    } else {
      let token = request.cookies?.[cookie];
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        token = randomBytes(32).toString('hex');
        context
          .switchToHttp()
          .getResponse<Response>()
          .cookie(cookie, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.config.get('NODE_ENV') === 'production',
            path: '/api/v1/torrent-discovery',
            maxAge: 30 * 24 * 60 * 60_000,
          });
      }
      request.discoveryOwner = `guest:${createHash('sha256')
        .update(token as string)
        .digest('hex')}`;
    }
    return true;
  }
}
