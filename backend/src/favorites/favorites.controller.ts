import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { AddFavoritesDto, FavoriteMediaRefDto } from './dto/favorite-media-ref.dto';
import { FavoritesResponseDto } from './dto/favorites-response.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(SessionGuard, CsrfGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.listMediaRefs(user.id) };
  }

  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddFavoritesDto,
  ): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.addMediaRefs(user.id, dto.mediaRefs) };
  }

  @Delete(':mediaRef')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() dto: FavoriteMediaRefDto,
  ): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.removeMediaRef(user.id, dto.mediaRef) };
  }
}
