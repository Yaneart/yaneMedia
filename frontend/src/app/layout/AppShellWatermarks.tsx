import { YaneMark } from '@/shared';

const navigationMarks = [
  '-left-1 top-[2%] size-10 -rotate-[18deg]',
  'right-4 top-[7.5%] size-11 rotate-[28deg]',
  'left-12 top-[13%] size-9 rotate-[142deg]',
  '-right-1 top-[18.5%] size-11 -rotate-[24deg]',
  'left-4 top-[24%] size-10 rotate-[20deg]',
  'right-10 top-[29.5%] size-9 rotate-[132deg]',
  '-left-1 top-[35%] size-11 -rotate-[34deg]',
  'right-4 top-[40.5%] size-10 rotate-[18deg]',
  'left-12 top-[46%] size-9 rotate-[148deg]',
  '-right-1 top-[51.5%] size-11 -rotate-[20deg]',
  'left-5 top-[57%] size-10 rotate-[30deg]',
  'right-11 top-[62.5%] size-9 rotate-[138deg]',
  '-left-1 top-[68%] size-11 -rotate-[28deg]',
  'right-5 top-[73.5%] size-10 rotate-[24deg]',
  'left-11 top-[79%] size-9 rotate-[152deg]',
  '-right-1 top-[84.5%] size-11 -rotate-[16deg]',
  'left-4 top-[90%] size-10 rotate-[34deg]',
  'right-10 top-[95.5%] size-9 rotate-[128deg]',
  'right-12 top-[4.5%] size-9 rotate-[136deg]',
  'left-14 top-[15.5%] size-10 -rotate-[26deg]',
  'right-14 top-[26.5%] size-9 rotate-[32deg]',
  'left-13 top-[37.5%] size-10 rotate-[144deg]',
  'right-12 top-[48.5%] size-9 -rotate-[22deg]',
  'left-14 top-[59.5%] size-10 rotate-[26deg]',
  'right-14 top-[70.5%] size-9 rotate-[138deg]',
  'left-13 top-[81.5%] size-10 -rotate-[30deg]',
  'right-12 top-[92.5%] size-9 rotate-[34deg]',
  'left-[42%] top-[9%] size-9 -rotate-[16deg]',
  'left-[38%] top-[20%] size-10 rotate-[132deg]',
  'left-[44%] top-[31%] size-9 rotate-[24deg]',
  'left-[39%] top-[42%] size-10 -rotate-[28deg]',
  'left-[43%] top-[53%] size-9 rotate-[146deg]',
  'left-[37%] top-[64%] size-10 rotate-[20deg]',
  'left-[44%] top-[75%] size-9 -rotate-[24deg]',
  'left-[39%] top-[86%] size-10 rotate-[136deg]',
  'left-[43%] top-[97%] size-9 rotate-[28deg]',
];

const frameMarks = [
  'left-[8%] -top-7 size-11 rotate-[22deg]',
  'left-[17%] -top-6 size-9 rotate-[146deg]',
  'left-[27%] -top-6 size-10 -rotate-[28deg]',
  'left-[48%] -top-7 size-11 rotate-[138deg]',
  'right-[32%] -top-6 size-9 rotate-[30deg]',
  'right-[25%] -top-6 size-10 rotate-[18deg]',
  'right-[5%] -top-7 size-11 -rotate-[24deg]',
  '-right-7 top-[16%] size-11 rotate-[32deg]',
  '-right-6 top-[27%] size-9 -rotate-[18deg]',
  '-right-6 top-[38%] size-10 rotate-[142deg]',
  '-right-7 top-[61%] size-11 -rotate-[20deg]',
  '-right-6 top-[72%] size-9 rotate-[136deg]',
  '-right-6 top-[82%] size-10 rotate-[26deg]',
  'left-[10%] -bottom-7 size-11 rotate-[136deg]',
  'left-[32%] -bottom-6 size-10 -rotate-[22deg]',
  'left-[44%] -bottom-6 size-9 rotate-[142deg]',
  'left-[55%] -bottom-7 size-11 rotate-[28deg]',
  'right-[27%] -bottom-6 size-9 -rotate-[26deg]',
  'right-[20%] -bottom-6 size-10 rotate-[148deg]',
  'right-[3%] -bottom-7 size-11 -rotate-[18deg]',
];

type AppShellWatermarksProps = {
  area?: 'navigation' | 'frame';
};

export function AppShellWatermarks({ area = 'navigation' }: AppShellWatermarksProps) {
  const marks = area === 'navigation' ? navigationMarks : frameMarks;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block"
    >
      {marks.map((className) => (
        <YaneMark
          key={className}
          className={`absolute ${className} text-watermark opacity-watermark`}
        />
      ))}
    </div>
  );
}
