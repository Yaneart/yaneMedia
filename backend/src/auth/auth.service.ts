import { UsersService } from './../users/users.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthUserDto } from './dto/auth-user.dto';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { AuthRepository } from './auth.repository';
import { generateToken, hashToken, isToken } from './token';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

      await this.sendVerificationEmail(user.id, user.email);

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

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Подтвердите email перед входом');
    }

    const token = generateToken();
    const ttlDays = this.configService.getOrThrow<number>('SESSION_TTL_DAYS');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.authRepository.create({
      tokenHash: hashToken(token),
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

  async logout(token: unknown): Promise<void> {
    if (!isToken(token)) {
      return;
    }

    await this.authRepository.deleteByTokenHash(hashToken(token));
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const url = new URL('/verify-email', this.configService.getOrThrow<string>('FRONTEND_ORIGIN'));
    url.hash = new URLSearchParams({ token }).toString();

    const saved = await this.authRepository.saveVerificationToken({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    });

    if (!saved) {
      return;
    }

    await this.mailService.sendVerificationEmail(email, url.toString());
  }

  async verifyEmail(token: string): Promise<{ success: true }> {
    if (!isToken(token) || !(await this.authRepository.verifyEmailByTokenHash(hashToken(token)))) {
      throw new BadRequestException('Ссылка недействительна или срок её действия истёк');
    }

    return { success: true };
  }

  async resendVerification(email: string): Promise<{ success: true }> {
    const user = await this.usersService.findByEmail(email);

    if (user && !user.emailVerifiedAt) {
      await this.sendVerificationEmail(user.id, user.email);
    }

    return { success: true };
  }
}
