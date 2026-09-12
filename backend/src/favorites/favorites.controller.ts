import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
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
  async list(@CurrentUser() user: AuthUserDto): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.listMediaRefs(user.id) };
  }

  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: AuthUserDto,
    @Body() dto: AddFavoritesDto,
  ): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.addMediaRefs(user.id, dto.mediaRefs) };
  }

  @Delete(':mediaRef')
  async remove(
    @CurrentUser() user: AuthUserDto,
    @Param() dto: FavoriteMediaRefDto,
  ): Promise<FavoritesResponseDto> {
    return { mediaRefs: await this.favoritesService.removeMediaRef(user.id, dto.mediaRef) };
  }
}
