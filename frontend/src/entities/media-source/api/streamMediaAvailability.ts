import { ApiClientError, createApiUrl } from '@/shared/api';

import type { MediaAvailability, MediaSourceEpisodeRef } from '../model/mediaSource';
import { mapMediaAvailability } from './mapMediaAvailability';
import type { MediaAvailabilityProgressDto } from './mediaAvailabilityDto';

export type MediaAvailabilityProgress = {
  availability: MediaAvailability | null;
  state: 'pending' | 'complete';
};

export type StreamMediaAvailabilityOptions = MediaSourceEpisodeRef & {
  signal?: AbortSignal;
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

function createAvailabilityPath(
  mediaRef: string,
  { seasonNumber, episodeNumber, absoluteEpisodeNumber }: MediaSourceEpisodeRef,
) {
  const searchParams = new URLSearchParams();

  if (seasonNumber !== undefined) {
    searchParams.set('seasonNumber', String(seasonNumber));
  }

  if (episodeNumber !== undefined) {
    searchParams.set('episodeNumber', String(episodeNumber));
  }

  if (absoluteEpisodeNumber !== undefined) {
    searchParams.set('absoluteEpisodeNumber', String(absoluteEpisodeNumber));
  }

  const query = searchParams.toString();

  return `/media/${encodeURIComponent(mediaRef)}/availability/stream${query ? `?${query}` : ''}`;
}

async function createResponseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;

  return new ApiClientError(
    payload?.error?.message ?? 'Request failed',
    response.status,
    payload?.error?.code ?? 'HTTP_ERROR',
  );
}

function parseProgressEvent(value: string): MediaAvailabilityProgressDto | null {
  const data = value
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');

  if (!data) {
    return null;
  }

  const snapshot = JSON.parse(data) as MediaAvailabilityProgressDto;

  if (snapshot.state !== 'pending' && snapshot.state !== 'complete') {
    throw new Error('Availability stream returned an invalid state.');
  }

  return snapshot;
}

export async function streamMediaAvailability(
  mediaRef: string,
  options: StreamMediaAvailabilityOptions,
  onProgress: (snapshot: MediaAvailabilityProgress) => void,
): Promise<void> {
  const response = await fetch(createApiUrl(createAvailabilityPath(mediaRef, options)), {
    cache: 'no-store',
    headers: {
      Accept: 'text/event-stream',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw await createResponseError(response);
  }

  if (!response.body) {
    throw new Error('Availability stream is not readable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedCompleteSnapshot = false;

  const emitBufferedEvents = () => {
    buffer = buffer.replaceAll('\r\n', '\n');
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const snapshot = parseProgressEvent(event);

      if (snapshot) {
        receivedCompleteSnapshot ||= snapshot.state === 'complete';
        onProgress({
          availability: snapshot.availability ? mapMediaAvailability(snapshot.availability) : null,
          state: snapshot.state,
        });
      }

      boundary = buffer.indexOf('\n\n');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      emitBufferedEvents();

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!receivedCompleteSnapshot) {
    throw new Error('Availability stream ended before completion.');
  }
}
