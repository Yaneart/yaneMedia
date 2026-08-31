import type { MediaRef, MediaType } from '../model/media';
import { YaneMark } from '@/shared';
import { getMediaFallbackDesign, mediaTypeLabels } from './mediaFallbackDesign';

export type MediaLandscapeFallbackProps = {
  compact?: boolean;
  mediaRef: MediaRef;
  title: string;
  type: MediaType;
  showTitle?: boolean;
  showType?: boolean;
};

const landscapeShapes = [
  '-right-[8%] -bottom-[58%] rotate-[18deg]',
  '-left-[4%] -bottom-[62%] -rotate-[16deg] scale-x-[-1]',
  'left-[38%] -bottom-[66%] rotate-[8deg]',
] as const;

export function MediaLandscapeFallback({
  compact = false,
  mediaRef,
  title,
  type,
  showTitle = true,
  showType = true,
}: MediaLandscapeFallbackProps) {
  const { hash, variant, variantNumber } = getMediaFallbackDesign(mediaRef);
  const shape = landscapeShapes[(hash >>> 13) % landscapeShapes.length];
  const hasLongTitle = title.length > 24;

  return (
    <div
      aria-hidden="true"
      className={[
        'relative isolate size-full overflow-hidden bg-linear-to-br text-white',
        variant.background,
      ].join(' ')}
    >
      <YaneMark className={['absolute h-[180%] w-[72%]', shape, variant.mark].join(' ')} />

      <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-white/10" />

      <div className="relative size-full p-4">
        <span className="text-[0.65rem] font-semibold tracking-[0.16em] uppercase">
          YM / {variantNumber}
        </span>

        {showTitle && (
          <div className="absolute inset-x-4 top-8 bottom-10 flex items-center overflow-hidden">
            <p
              lang="ru"
              className={[
                'line-clamp-3 max-w-[76%] font-extrabold tracking-[-0.055em] uppercase',
                'wrap-break-word leading-[0.88] hyphens-auto text-white/80',
                compact
                  ? 'text-[0.7rem] min-[360px]:text-xs sm:text-base xl:text-lg'
                  : hasLongTitle
                    ? 'text-sm min-[360px]:text-base sm:text-lg xl:text-xl'
                    : 'text-xl sm:text-2xl xl:text-[1.75rem]',
              ].join(' ')}
            >
              {title}
            </p>
          </div>
        )}

        {showType && (
          <span className="absolute bottom-4 left-4 text-xs font-semibold tracking-[0.16em] uppercase">
            {mediaTypeLabels[type]}
          </span>
        )}
      </div>
    </div>
  );
}
