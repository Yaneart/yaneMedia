import { applyDecorators, Header, SetMetadata, UseInterceptors } from '@nestjs/common';
import { PublicMetadataCacheInterceptor } from './public-metadata-cache.interceptor';

const PUBLIC_METADATA_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=86400';
export const PUBLIC_METADATA_CACHE = Symbol('PUBLIC_METADATA_CACHE');

export function PublicMetadataCache({ server = false } = {}) {
  return applyDecorators(
    SetMetadata(PUBLIC_METADATA_CACHE, true),
    Header('Cache-Control', PUBLIC_METADATA_CACHE_CONTROL),
    Header('Vary', 'Origin'),
    ...(server ? [UseInterceptors(PublicMetadataCacheInterceptor)] : []),
  );
}

export function NoStore() {
  return Header('Cache-Control', 'no-store');
}
