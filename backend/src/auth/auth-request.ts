import type { Request } from 'express';
import type { AuthUserDto } from './dto/auth-user.dto';

export type AuthRequest = Omit<Request, 'cookies'> & {
  cookies?: Record<string, unknown>;
  user?: AuthUserDto;
};
