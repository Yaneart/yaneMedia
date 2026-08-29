import type { MediaRef, MediaType } from '../model/media';
import { YaneMark } from '@/shared';
import { getMediaFallbackDesign, mediaTypeLabels } from './mediaFallbackDesign';

export type MediaPosterFallbackProps = {
  mediaRef: MediaRef;
  title: string;
  type: MediaType;
};

const shapeVariants = [
  '-left-[35%] top-[4%] -rotate-12',
  '-right-[42%] top-[14%] rotate-[24deg]',
  '-left-[28%] bottom-[2%] scale-x-[-1] rotate-6',
] as const;

export function MediaPosterFallback({ mediaRef, title, type }: MediaPosterFallbackProps) {
  const { hash, variant, variantNumber } = getMediaFallbackDesign(mediaRef);
  const shape = shapeVariants[(hash >>> 13) % shapeVariants.length];

  return (
    <div
      aria-hidden="true"
      className={[
        'relative isolate size-full overflow-hidden bg-linear-to-br text-white',
        variant.background,
      ].join(' ')}
    >
      <YaneMark className={['absolute h-[78%] w-[165%]', shape, variant.mark].join(' ')} />

      <div className="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-white/10" />

      <div className="relative size-full p-4">
        <span className="text-[0.65rem] font-semibold tracking-[0.16em] uppercase">
          YM / {variantNumber}
        </span>

        <div className="absolute inset-x-4 top-14 bottom-14 flex items-center overflow-hidden">
          <p
            lang="ru"
            className={[
              'max-w-full',
              'text-xl sm:text-2xl xl:text-[2.25rem]',
              'leading-[0.86] font-extrabold tracking-[-0.06em] uppercase',
              'wrap-break-word hyphens-auto',
              'text-white/80',
            ].join(' ')}
          >
            {title}
          </p>
        </div>

        <div className="absolute inset-x-4 bottom-4 flex items-end">
          <span className="text-xs font-semibold tracking-[0.16em] uppercase">
            {mediaTypeLabels[type]}
          </span>
        </div>
      </div>
    </div>
  );
}
