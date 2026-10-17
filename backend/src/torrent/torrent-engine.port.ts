export type EngineTorrentKey = string & { readonly __engineTorrentKey: unique symbol };
export type EngineFileKey = number & { readonly __engineFileKey: unique symbol };
export type ValidatedMagnet = string & { readonly __validatedMagnet: unique symbol };
export type ValidatedMetainfo = Uint8Array & { readonly __validatedMetainfo: unique symbol };

export type EngineTorrentState =
  'added' | 'getting_info' | 'preloading' | 'working' | 'closed' | 'stored' | 'unknown';

export interface EngineFile {
  key: EngineFileKey;
  path: string;
  length: number;
}

export interface EngineTorrentStatus {
  key: EngineTorrentKey;
  state: EngineTorrentState;
  loadedBytes: number;
  totalBytes: number;
  downloadBytesPerSecond: number;
  activePeers: number;
  connectedSeeders: number;
  files: EngineFile[];
}

export interface SeekableByteStream {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
}

export interface TorrentEnginePort {
  addMagnet(input: ValidatedMagnet, signal: AbortSignal): Promise<EngineTorrentKey>;
  addMetainfo(input: ValidatedMetainfo, signal: AbortSignal): Promise<EngineTorrentKey>;
  getStatus(key: EngineTorrentKey, signal: AbortSignal): Promise<EngineTorrentStatus>;
  listFiles(key: EngineTorrentKey, signal: AbortSignal): Promise<EngineFile[]>;
  openFileStream(
    key: EngineTorrentKey,
    file: EngineFileKey,
    request: { offset: number; length?: number },
    signal: AbortSignal,
  ): Promise<SeekableByteStream>;
  heartbeat(key: EngineTorrentKey, signal: AbortSignal): Promise<void>;
  drop(key: EngineTorrentKey, signal: AbortSignal): Promise<void>;
  listOwned(signal: AbortSignal): Promise<EngineTorrentKey[]>;
}
