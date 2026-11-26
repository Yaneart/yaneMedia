import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ExternalArtworkService } from '../../../src/media/assets/external-artwork.service';
import type { MediaEgress } from '../../../src/media/media-egress';

const poster = 'https://image.tmdb.org/t/p/w500/poster.jpg';
const signal = new AbortController().signal;

function fixture(enabled = true) {
  const fetch = jest.fn<Promise<Response>, Parameters<MediaEgress['fetch']>>();
  return {
    artwork: new ExternalArtworkService({ enabled, fetch } as unknown as MediaEgress),
    fetch,
  };
}

it('rewrites allowed external artwork and preserves local artwork', () => {
  const { artwork } = fixture();
  const url = new URL(artwork.publicUrl(poster), 'https://example.test');
  expect(url.pathname).toBe('/api/v1/media/artwork/external');
  expect(url.searchParams.get('url')).toBe(poster);
  expect(artwork.publicUrl('/api/v1/media/assets/poster/local.webp')).toBe(
    '/api/v1/media/assets/poster/local.webp',
  );
  expect(fixture(false).artwork.publicUrl(poster)).toBe(poster);
});

it('streams an allowed image after validating a redirect', async () => {
  const { artwork, fetch } = fixture();
  const redirected = 'https://shikimori.io/uploads/poster/animes/20/poster.webp';
  fetch.mockResolvedValueOnce(Response.redirect(redirected));
  fetch.mockResolvedValueOnce(
    new Response(new Uint8Array([7, 20]), { headers: { 'content-type': 'image/webp' } }),
  );

  const { body, contentType } = await artwork.open(poster, signal);
  expect(contentType).toBe('image/webp');
  expect(await new Response(body).bytes()).toEqual(new Uint8Array([7, 20]));
  expect(fetch).toHaveBeenLastCalledWith(new URL(redirected), { signal, redirect: 'manual' });
});

it('rejects unapproved requests and redirects before making the next request', async () => {
  const { artwork, fetch } = fixture();
  await expect(artwork.open('https://shikimori.io/api/graphql', signal)).rejects.toBeInstanceOf(
    NotFoundException,
  );
  await expect(artwork.open('http://127.0.0.1/private', signal)).rejects.toBeInstanceOf(
    NotFoundException,
  );
  expect(fetch).not.toHaveBeenCalled();

  fetch.mockResolvedValueOnce(Response.redirect('https://example.test/poster.jpg'));
  await expect(artwork.open(poster, signal)).rejects.toBeInstanceOf(BadGatewayException);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects non-image responses from approved hosts', async () => {
  const { artwork, fetch } = fixture();
  fetch.mockResolvedValueOnce(
    new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  );
  await expect(artwork.open(poster, signal)).rejects.toBeInstanceOf(BadGatewayException);
});
