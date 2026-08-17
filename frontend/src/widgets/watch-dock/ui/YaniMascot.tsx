import { useEffect, useRef, useState } from 'react';

const desktopMascotQuery = '(min-width: 1280px)';
const arrivalDurationMilliseconds = 2000;
const reactionDurationMilliseconds = 720;
const walkSpriteUrl = '/images/mascot/yani-sprite-sheet-v5-walk.png';
const settleSpriteUrl = '/images/mascot/yani-sprite-sheet-v5-settle.png';
const spriteUrls = [walkSpriteUrl, settleSpriteUrl] as const;

type EntrancePhase = 'waiting' | 'arriving' | 'idle';

export function YaniMascot() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(desktopMascotQuery).matches,
  );
  const [isSpriteReady, setIsSpriteReady] = useState(false);
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>('waiting');
  const [isReacting, setIsReacting] = useState(false);
  const reactionTimer = useRef<number | null>(null);

  useEffect(() => {
    const desktopMedia = window.matchMedia(desktopMascotQuery);
    const updateDesktopState = () => setIsDesktop(desktopMedia.matches);

    desktopMedia.addEventListener('change', updateDesktopState);

    return () => desktopMedia.removeEventListener('change', updateDesktopState);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    let isCancelled = false;
    const loadedSpriteUrls = new Set<string>();
    const sprites = spriteUrls.map((url) => {
      const sprite = new Image();
      const markSpriteAsLoaded = () => {
        loadedSpriteUrls.add(url);

        if (!isCancelled && loadedSpriteUrls.size === spriteUrls.length) {
          setIsSpriteReady(true);
        }
      };

      sprite.addEventListener('load', markSpriteAsLoaded);
      sprite.src = url;

      if (sprite.complete && sprite.naturalWidth > 0) {
        markSpriteAsLoaded();
      }

      return { sprite, markSpriteAsLoaded };
    });

    return () => {
      isCancelled = true;
      sprites.forEach(({ sprite, markSpriteAsLoaded }) => {
        sprite.removeEventListener('load', markSpriteAsLoaded);
      });
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isSpriteReady) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setEntrancePhase('idle');
      return;
    }

    setEntrancePhase('arriving');
    const idleTimer = window.setTimeout(() => setEntrancePhase('idle'), arrivalDurationMilliseconds);

    return () => {
      window.clearTimeout(idleTimer);
    };
  }, [isSpriteReady]);

  useEffect(
    () => () => {
      if (reactionTimer.current !== null) {
        window.clearTimeout(reactionTimer.current);
      }
    },
    [],
  );

  const hasEntered = entrancePhase === 'idle';

  const playReaction = () => {
    if (!hasEntered || isReacting) return;

    setIsReacting(true);
    reactionTimer.current = window.setTimeout(() => {
      setIsReacting(false);
      reactionTimer.current = null;
    }, reactionDurationMilliseconds);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden xl:block">
      <div
        className={[
          'absolute shrink-0',
          !isSpriteReady || entrancePhase === 'waiting'
            ? 'opacity-0'
            : entrancePhase === 'arriving'
              ? 'yani-mascot-arriving'
              : 'yani-mascot-entered',
        ].join(' ')}
      >
        <button
          type="button"
          aria-label="Поиграть с Yani"
          aria-disabled={!hasEntered}
          title="Поиграть с Yani"
          tabIndex={hasEntered ? 0 : -1}
          className={[
            'pointer-events-auto relative block size-[5.5rem] rounded-full border-0 bg-transparent p-0',
            'transition-transform duration-200 ease-out hover:scale-105 active:scale-95',
            'motion-reduce:transform-none motion-reduce:transition-none',
            !hasEntered ? 'pointer-events-none' : '',
          ].join(' ')}
          onClick={playReaction}
        >
          <span
            aria-hidden="true"
            className="relative block size-full drop-shadow-[0_0_4px_rgb(49_95_189_/_18%)]"
          >
            {entrancePhase === 'arriving' ? (
              <>
                <span
                  className="yani-mascot-sprite yani-mascot-arrival-layer yani-mascot-walk-sequence"
                  style={{ backgroundImage: `url(${walkSpriteUrl})` }}
                />
                <span
                  className="yani-mascot-sprite yani-mascot-arrival-layer yani-mascot-settle-sequence"
                  style={{ backgroundImage: `url(${settleSpriteUrl})` }}
                />
              </>
            ) : (
              <span
                className={`yani-mascot-sprite block size-full${isReacting ? ' yani-mascot-reaction' : ''}`}
                style={{ backgroundImage: `url(${settleSpriteUrl})` }}
              />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
