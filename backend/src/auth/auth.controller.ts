import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from './session-cookie';
import { SessionGuard } from './guards/session.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserDto } from './dto/auth-user.dto';
import { CsrfGuard } from './guards/csrf.guard';
import type { Response } from 'express';
import type { AuthRequest } from './auth-request';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { user, token, expiresAt } = await this.authService.login(dto);

    const isProduction = this.configService.getOrThrow<string>('NODE_ENV') === 'production';

    response.cookie(SESSION_COOKIE_NAME, token, {
      ...getSessionCookieOptions(isProduction),
      expires: expiresAt,
    });

    return { user };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthUserDto): { user: AuthUserDto } {
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.logout(request.cookies?.[SESSION_COOKIE_NAME]);

    const isProduction = this.configService.getOrThrow<string>('NODE_ENV') === 'production';

    response.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions(isProduction));

    return { success: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }
}
