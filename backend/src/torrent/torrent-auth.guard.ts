import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository';
import type { AuthRequest } from '../auth/auth-request';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { hashToken, isToken } from '../auth/token';

@Injectable()
export class TorrentAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!isToken(token))
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' });
    const user = await this.auth.findUserBySessionHash(hashToken(token), new Date(), false);
    if (!user) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' });
    if (!user.emailVerifiedAt)
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'EMAIL_VERIFICATION_REQUIRED',
      });
    request.user = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      role: user.role,
    };
    return true;
  }
}
