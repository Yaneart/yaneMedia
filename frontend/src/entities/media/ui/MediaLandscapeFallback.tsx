import type { MediaRef, MediaType } from '../model/media';
import { YaneMark } from '@/shared';
import { getMediaFallbackDesign, mediaTypeLabels } from './mediaFallbackDesign';

export type MediaLandscapeFallbackProps = {
  mediaRef: MediaRef;
  title: string;
  type: MediaType;
  showType?: boolean;
};

const landscapeShapes = [
  '-right-[8%] -bottom-[58%] rotate-[18deg]',
  '-left-[4%] -bottom-[62%] -rotate-[16deg] scale-x-[-1]',
  'left-[38%] -bottom-[66%] rotate-[8deg]',
] as const;

export function MediaLandscapeFallback({
  mediaRef,
  title,
  type,
  showType = true,
}: MediaLandscapeFallbackProps) {
  const { hash, variant, variantNumber } = getMediaFallbackDesign(mediaRef);
  const shape = landscapeShapes[(hash >>> 13) % landscapeShapes.length];

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

        <div className="absolute inset-x-4 top-8 bottom-10 flex items-center overflow-hidden">
          <p
            lang="ru"
            className={[
              'max-w-[76%] text-xl sm:text-2xl xl:text-[1.75rem]',
              'leading-[0.88] font-extrabold tracking-[-0.055em] uppercase',
              'wrap-break-word hyphens-auto text-white/80',
            ].join(' ')}
          >
            {title}
          </p>
        </div>

        {showType && (
          <span className="absolute bottom-4 left-4 text-xs font-semibold tracking-[0.16em] uppercase">
            {mediaTypeLabels[type]}
          </span>
        )}
      </div>
    </div>
  );
}
