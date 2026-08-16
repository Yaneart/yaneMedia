import { useContext } from 'react';
import { PlaybackSessionContext } from './playbackSessionContext';

export function usePlaybackSession() {
  const playbackSession = useContext(PlaybackSessionContext);

  if (!playbackSession) {
    throw new Error('usePlaybackSession must be used within PlaybackSessionProvider');
  }

  return playbackSession;
}
