import type { ReactNode } from 'react';

import { ScrollRestorationContext, type RowScrollRestoration } from './scrollRestorationContext';

export function ScrollRestorationProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: RowScrollRestoration;
}) {
  return (
    <ScrollRestorationContext.Provider value={value}>{children}</ScrollRestorationContext.Provider>
  );
}
