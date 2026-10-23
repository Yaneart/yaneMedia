export type TorrServerErrorCode =
  'invalid' | 'timeout' | 'unavailable' | 'not_found' | 'protocol' | 'aborted';

export class TorrServerError extends Error {
  constructor(
    readonly code: TorrServerErrorCode,
    readonly operation: string,
  ) {
    super(`Torrent engine ${operation} failed (${code})`);
    this.name = 'TorrServerError';
  }
}
