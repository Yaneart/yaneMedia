import { Body, Controller, Header, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
