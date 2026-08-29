import { getMediaAvailability, type MediaAvailability } from '@/entities/media-source';
import { ApiClientError } from '@/shared/api';
import { useEffect, useState } from 'react';

type MediaAvailabilityStatus = 'loading' | 'success' | 'not-found' | 'error';

interface MediaAvailabilityState {
  mediaRef: string | undefined;
  availability: MediaAvailability | null;
  status: MediaAvailabilityStatus;
}

export function useMediaAvailability(mediaRef: string | undefined) {
  const [state, setState] = useState<MediaAvailabilityState>(() => ({
    mediaRef,
    availability: null,
    status: mediaRef ? 'loading' : 'not-found',
  }));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!mediaRef) {
      setState({
        mediaRef,
        availability: null,
        status: 'not-found',
      });

      return;
    }

    const controller = new AbortController();

    setState({
      mediaRef,
      availability: null,
      status: 'loading',
    });

    const loadAvailability = async () => {
      try {
        const availability = await getMediaAvailability(mediaRef, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setState({
          mediaRef,
          availability,
          status: 'success',
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          mediaRef,
          availability: null,
          status: error instanceof ApiClientError && error.status === 404 ? 'not-found' : 'error',
        });
      }
    };

    void loadAvailability();

    return () => {
      controller.abort();
    };
  }, [mediaRef, reloadKey]);

  const retry = () => {
    setState({
      mediaRef,
      availability: null,
      status: mediaRef ? 'loading' : 'not-found',
    });
    setReloadKey((currentKey) => currentKey + 1);
  };

  const isCurrentResult = state.mediaRef === mediaRef;

  return {
    availability: isCurrentResult ? state.availability : null,
    status: isCurrentResult ? state.status : 'loading',
    retry,
  };
}
