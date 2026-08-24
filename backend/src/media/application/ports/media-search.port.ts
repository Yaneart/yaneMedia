export const MEDIA_SEARCH_PORT = Symbol('MEDIA_SEARCH_PORT');

export interface MediaSearchPort {
  searchByTitle(title: string): Promise<unknown>;
}
