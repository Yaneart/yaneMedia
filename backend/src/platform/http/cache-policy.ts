import { applyDecorators, Header, SetMetadata } from '@nestjs/common';

export const PUBLIC_METADATA_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=86400';
export const PUBLIC_METADATA_CACHE = Symbol('PUBLIC_METADATA_CACHE');

export function PublicMetadataCache() {
  return applyDecorators(
    SetMetadata(PUBLIC_METADATA_CACHE, true),
    Header('Cache-Control', PUBLIC_METADATA_CACHE_CONTROL),
    Header('Vary', 'Origin'),
  );
}

export function NoStore() {
  return Header('Cache-Control', 'no-store');
}
