export function HomeHeroSkeleton() {
  return (
    <section
      aria-busy="true"
      className={[
        'relative isolate min-h-[500px] overflow-hidden bg-skeleton',
        'animate-pulse motion-reduce:animate-none md:min-h-[clamp(32rem,62vh,43rem)]',
      ].join(' ')}
    >
      <p role="status" className="sr-only">
        Загружаем главную
      </p>

      <div
        aria-hidden="true"
        className="relative flex min-h-[500px] items-end px-5 pt-28 pb-14 md:min-h-[clamp(32rem,62vh,43rem)] md:px-page md:pt-32 md:pb-20"
      >
        <div className="w-full max-w-[38rem]">
          <div className="h-7 w-24 rounded-pill bg-surface/70" />
          <div className="mt-5 h-4 w-52 rounded-overlay bg-surface/70" />
          <div className="mt-3 h-16 w-4/5 rounded-overlay bg-surface/70 sm:h-20" />
          <div className="mt-4 h-5 w-full max-w-[30rem] rounded-overlay bg-surface/70" />
          <div className="mt-2 h-5 w-3/4 max-w-[24rem] rounded-overlay bg-surface/70" />
          <div className="mt-7 h-12 w-36 rounded-pill bg-surface/70" />
        </div>
      </div>
    </section>
  );
}
