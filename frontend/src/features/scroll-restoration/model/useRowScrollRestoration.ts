import { useContext } from 'react';

import { ScrollRestorationContext } from './scrollRestorationContext';

export function useRowScrollRestoration() {
  return useContext(ScrollRestorationContext);
}
