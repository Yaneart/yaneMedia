import type { MediaRef, MediaType } from '../model/media';
import { YaneMark } from '@/shared';

export type MediaPosterFallbackProps = {
  mediaRef: MediaRef;
  title: string;
  type: MediaType;
};

const MediaTypeLabel = {
  movie: 'Фильм',
  series: 'Сериал',
  anime: 'Аниме',
} satisfies Record<MediaType, string>;

const posterVariants = [
  {
    background: 'from-[#315fa8] via-[#263b73] to-[#131a2d]',
    mark: 'text-[#a9c7e8]/45',
  },
  {
    background: 'from-[#a84e67] via-[#6f3157] to-[#25172f]',
    mark: 'text-[#dc9b87]/45',
  },
  {
    background: 'from-[#3d8978] via-[#245f59] to-[#102d32]',
    mark: 'text-[#a6c7b3]/45',
  },
  {
    background: 'from-[#b76447] via-[#783344] to-[#2d1826]',
    mark: 'text-[#dfb77f]/45',
  },
  {
    background: 'from-[#a97938] via-[#68462f] to-[#29232a]',
    mark: 'text-[#d8c5a5]/45',
  },
  {
    background: 'from-[#6857a3] via-[#443b78] to-[#1c2038]',
    mark: 'text-[#b8add5]/45',
  },
  {
    background: 'from-[#2b7891] via-[#174c65] to-[#0c2638]',
    mark: 'text-[#a7d3dc]/45',
  },
  {
    background: 'from-[#864967] via-[#512d51] to-[#24172e]',
    mark: 'text-[#d2a4bd]/45',
  },
  {
    background: 'from-[#47765d] via-[#2d5144] to-[#132c29]',
    mark: 'text-[#b4cfb9]/45',
  },
  {
    background: 'from-[#a7553f] via-[#6d332e] to-[#2c1b21]',
    mark: 'text-[#e0b091]/45',
  },
  {
    background: 'from-[#334d78] via-[#1f3154] to-[#111b31]',
    mark: 'text-[#ccb77b]/45',
  },
  {
    background: 'from-[#59616f] via-[#343a46] to-[#171b24]',
    mark: 'text-[#d59a68]/50',
  },
] as const;

const shapeVariants = [
  '-left-[35%] top-[4%] -rotate-12',
  '-right-[42%] top-[14%] rotate-[24deg]',
  '-left-[28%] bottom-[2%] scale-x-[-1] rotate-6',
] as const;

function hashMediaRef(mediaRef: MediaRef) {
  let hash = 0;

  for (const character of mediaRef) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return hash;
}

export function MediaPosterFallback({ mediaRef, title, type }: MediaPosterFallbackProps) {
  const hash = hashMediaRef(mediaRef);
  const variantIndex = (hash >>> 6) % posterVariants.length;
  const variant = posterVariants[variantIndex];
  const shape = shapeVariants[(hash >>> 13) % shapeVariants.length];
  const variantNumber = String(variantIndex + 1).padStart(2, '0');

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
            {MediaTypeLabel[type]}
          </span>
        </div>
      </div>
    </div>
  );
}
