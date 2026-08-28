import type { MediaRef } from '../model/media';
import { YaneMark } from '@/shared';

export type MediaLandscapeFallbackProps = {
  mediaRef: MediaRef;
};

const landscapeVariants = [
  'from-[#213b52] via-[#172a3a] to-[#0c151f]',
  'from-[#6f3c2b] via-[#48271f] to-[#191111]',
  'from-[#405044] via-[#29352d] to-[#111a16]',
  'from-[#373047] via-[#252033] to-[#121019]',
  'from-[#254651] via-[#18313a] to-[#0c171c]',
  'from-[#533849] via-[#382633] to-[#181117]',
] as const;

function hashMediaRef(mediaRef: MediaRef) {
  let hash = 0;

  for (const character of mediaRef) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return hash;
}

export function MediaLandscapeFallback({ mediaRef }: MediaLandscapeFallbackProps) {
  const hash = hashMediaRef(mediaRef);
  const background = landscapeVariants[hash % landscapeVariants.length];
  const mirrorMark = (hash & 1) === 1;

  return (
    <div
      aria-hidden="true"
      className={['relative size-full overflow-hidden bg-linear-to-br', background].join(' ')}
    >
      <YaneMark
        className={[
          'absolute -right-[12%] -bottom-[75%] h-[190%] w-[78%] rotate-[18deg]',
          'text-white/12',
          mirrorMark ? 'scale-x-[-1]' : '',
        ].join(' ')}
      />
      <div className="absolute inset-0 bg-linear-to-br from-white/8 via-transparent to-black/20" />
    </div>
  );
}
