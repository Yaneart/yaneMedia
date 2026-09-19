import type { MediaDetailsDto } from './media-details.dto';
import type { AnimeSeasonChainEntryDto } from './anime-season-chain.dto';

export class MediaDetailsResponseDto {
  details!: MediaDetailsDto;
  degraded!: boolean;
  animeSeasonChain?: AnimeSeasonChainEntryDto[];
}
