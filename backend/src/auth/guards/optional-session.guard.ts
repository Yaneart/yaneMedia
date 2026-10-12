import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../auth-request';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { SessionGuard } from './session.guard';

@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly sessionGuard: SessionGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.sessionGuard.findUser(request.cookies?.[SESSION_COOKIE_NAME]);
    if (user) request.user = user;
    return true;
  }
}
