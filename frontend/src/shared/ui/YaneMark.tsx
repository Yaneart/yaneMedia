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
