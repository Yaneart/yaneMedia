import { getMediaDetails, type MediaDetailsResult } from '@/entities/media';
import { ApiClientError } from '@/shared/api';
import { useEffect, useState } from 'react';

type MediaDetailsStatus = 'loading' | 'success' | 'not-found' | 'error';

interface MediaDetailsState {
  mediaRef: string | undefined;
  result: MediaDetailsResult | null;
  status: MediaDetailsStatus;
}

export function useMediaDetails(mediaRef: string | undefined) {
  const [state, setState] = useState<MediaDetailsState>(() => ({
    mediaRef,
    result: null,
    status: mediaRef ? 'loading' : 'not-found',
  }));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!mediaRef) {
      setState({
        mediaRef,
        result: null,
        status: 'not-found',
      });

      return;
    }

    const controller = new AbortController();

    setState({
      mediaRef,
      result: null,
      status: 'loading',
    });

    const loadDetails = async () => {
      try {
        const result = await getMediaDetails(mediaRef, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setState({
          mediaRef,
          result,
          status: 'success',
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          mediaRef,
          result: null,
          status: error instanceof ApiClientError && error.status === 404 ? 'not-found' : 'error',
        });
      }
    };

    void loadDetails();

    return () => {
      controller.abort();
    };
  }, [mediaRef, reloadKey]);

  const retry = () => {
    setState({
      mediaRef,
      result: null,
      status: mediaRef ? 'loading' : 'not-found',
    });
    setReloadKey((currentKey) => currentKey + 1);
  };

  const isCurrentResult = state.mediaRef === mediaRef;

  return {
    result: isCurrentResult ? state.result : null,
    status: isCurrentResult ? state.status : 'loading',
    retry,
  };
}
