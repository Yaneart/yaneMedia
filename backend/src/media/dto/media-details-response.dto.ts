import type { MediaDetailsDto } from './media-details.dto';

export class MediaDetailsResponseDto {
  details!: MediaDetailsDto;
  degraded!: boolean;
}
