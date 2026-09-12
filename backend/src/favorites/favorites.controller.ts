import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { FavoritesResponseDto } from './dto/favorites-response.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserDto): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.listMediaRefs(user.id) };
  }
}
