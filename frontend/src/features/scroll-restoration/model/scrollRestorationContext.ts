import { createContext } from 'react';

export type RowScrollRestoration = {
  getScrollLeft: (rowKey: string) => number;
  saveScrollLeft: (rowKey: string, scrollLeft: number) => void;
};

export const ScrollRestorationContext = createContext<RowScrollRestoration | null>(null);
