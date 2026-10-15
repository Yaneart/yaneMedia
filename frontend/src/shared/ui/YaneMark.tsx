import type { ComponentPropsWithRef } from 'react';

export type YaneMarkProps = ComponentPropsWithRef<'svg'>;

export function YaneMark({ className = '', ...props }: YaneMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        fill="currentColor"
        d="M54 327C44 286 58 254 87 231L190 151C218 129 250 139 260 158C267 170 263 184 255 199L207 285L83 326C70 330 60 333 54 327ZM207 285L235 267C250 262 267 265 277 270L250 348L347 268C382 239 419 249 445 270C457 280 466 292 461 300L250 373C219 384 195 372 184 351C174 331 180 309 207 285Z"
      />
    </svg>
  );
}

const backgroundMarks = [
  'left-[7%] top-[12%] size-44 rotate-[22deg] opacity-[0.28]',
  'left-[18%] top-[30%] size-24 -rotate-[28deg] opacity-[0.24]',
  'left-[42%] -top-8 size-56 rotate-[138deg] opacity-[0.26]',
  'left-[68%] top-[18%] size-32 rotate-[35deg] opacity-[0.27]',
  '-right-10 top-[42%] size-56 -rotate-[20deg] opacity-[0.3]',
  'left-[7%] top-[64%] size-28 rotate-[142deg] opacity-[0.22]',
  'left-[35%] top-[72%] size-40 rotate-[28deg] opacity-[0.25]',
  'left-[59%] top-[52%] size-24 -rotate-[18deg] opacity-[0.22]',
  'left-[84%] top-[78%] size-40 rotate-[145deg] opacity-[0.28]',
  'left-[25%] bottom-0 size-40 rotate-[24deg] opacity-[0.28]',
] as const;

export function YaneMarkField() {
  return (
    <>
      {backgroundMarks.map((className) => (
        <YaneMark
          key={className}
          className={`absolute text-watermark ${className}`}
        />
      ))}
    </>
  );
}
