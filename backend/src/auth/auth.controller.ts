import { Body, Controller, Header, HttpCode, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from './session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { user, token, expiresAt } = await this.authService.login(dto);

    const isProduction = this.configService.getOrThrow<string>('NODE_ENV') === 'production';

    response.cookie(SESSION_COOKIE_NAME, token, {
      ...getSessionCookieOptions(isProduction),
      expires: expiresAt,
    });

    return { user };
  }
}
