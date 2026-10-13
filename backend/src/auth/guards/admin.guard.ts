import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthRequest } from '../auth-request';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (user?.role !== 'admin') {
      throw new ForbiddenException({
        code: 'ACTION_FORBIDDEN',
        message: 'Действие доступно только администратору',
      });
    }
    return true;
  }
}
