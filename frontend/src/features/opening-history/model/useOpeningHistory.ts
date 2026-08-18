import { useContext } from 'react';
import { OpeningHistoryContext } from './openingHistoryContext';

export function useOpeningHistory() {
  const openingHistory = useContext(OpeningHistoryContext);

  if (!openingHistory) {
    throw new Error('useOpeningHistory must be used within OpeningHistoryProvider');
  }

  return openingHistory;
}
