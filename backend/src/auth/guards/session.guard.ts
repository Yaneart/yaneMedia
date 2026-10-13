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
import type { AuthenticatedUser } from '../auth-request';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authRepository: AuthRepository) {}

  async findUser(token: unknown): Promise<AuthenticatedUser | null> {
    if (!isToken(token)) {
      return null;
    }

    const tokenHash = hashToken(token);
    const now = new Date();
    const user = await this.authRepository.findUserBySessionHash(tokenHash, now);

    if (!user) {
      await this.authRepository.deleteExpiredByTokenHash(tokenHash, now);
      return null;
    }

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      role: user.role,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.findUser(request.cookies?.[SESSION_COOKIE_NAME]);

    if (!user) {
      throw new UnauthorizedException('Необходим вход в аккаунт');
    }

    request.user = user;

    return true;
  }
}
