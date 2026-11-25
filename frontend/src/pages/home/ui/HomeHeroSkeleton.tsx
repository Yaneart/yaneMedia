export function HomeHeroSkeleton() {
  return (
    <section
      aria-busy="true"
      className="home-hero-height relative isolate animate-pulse overflow-hidden bg-skeleton motion-reduce:animate-none"
    >
      <p role="status" className="sr-only">
        Загружаем главную
      </p>

      <div
        aria-hidden="true"
        className="home-hero-height relative flex items-end px-5 pt-28 pb-14 md:px-page md:pt-32 md:pb-20 wide:mx-auto wide:max-w-home-content wide:pb-24"
      >
        <div className="w-full max-w-[38rem] wide:max-w-3xl">
          <div className="h-7 w-24 rounded-pill bg-surface/70" />
          <div className="mt-5 h-4 w-52 rounded-overlay bg-surface/70" />
          <div className="mt-3 h-16 w-4/5 rounded-overlay bg-surface/70 sm:h-20 wide:h-24" />
          <div className="mt-4 h-5 w-full max-w-[30rem] rounded-overlay bg-surface/70" />
          <div className="mt-2 h-5 w-3/4 max-w-[24rem] rounded-overlay bg-surface/70" />
          <div className="mt-7 h-12 w-36 rounded-pill bg-surface/70" />
        </div>
      </div>
    </section>
  );
}
