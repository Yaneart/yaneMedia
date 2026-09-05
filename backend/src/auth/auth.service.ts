import { UsersService } from './../users/users.service';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthUserDto } from './dto/auth-user.dto';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { AuthRepository } from './auth.repository';
import { generateSessionToken, hashSessionToken } from './session-token';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authRepository: AuthRepository,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: AuthUserDto }> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Этот email уже занят');
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.usersService.create({
        displayName: dto.displayName,
        email: dto.email,
        passwordHash,
      });

      return {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;

      if (
        cause instanceof DatabaseError &&
        cause.code === '23505' &&
        cause.constraint === 'users_email_unique'
      ) {
        throw new ConflictException('Этот email уже занят');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{
    user: AuthUserDto;
    token: string;
    expiresAt: Date;
  }> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordValid = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      dto.password,
    );

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.authRepository.create({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
      token,
      expiresAt,
    };
  }
}
