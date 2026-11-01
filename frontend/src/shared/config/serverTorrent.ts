// Home remains the default for existing local installations; Public sets this to false.
export const SERVER_TORRENT_ENABLED = import.meta.env?.VITE_SERVER_TORRENT_ENABLED !== 'false';
