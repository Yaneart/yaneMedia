import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthRequest } from '../auth-request';
import { AuthRepository } from '../auth.repository';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { hashToken, isToken } from '../token';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authRepository: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!isToken(token)) {
      throw new UnauthorizedException('Необходим вход в аккаунт');
    }

    const tokenHash = hashToken(token);
    const now = new Date();
    const user = await this.authRepository.findUserBySessionHash(tokenHash, now);

    if (!user) {
      await this.authRepository.deleteExpiredByTokenHash(tokenHash, now);
      throw new UnauthorizedException('Необходим вход в аккаунт');
    }

    request.user = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };

    return true;
  }
}
