import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

test('TMDB trailer endpoint returns a validated official YouTube trailer without exposing the API key', async (t) => {
  const originalFetch = globalThis.fetch;
  const config = readConfig({ TMDB_API_KEY: 'tmdb-test-secret' });
  const server = createApp({ config, pool: null, telegram: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  });

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href : String(input));
    if (url.hostname === '127.0.0.1') return originalFetch(input, init);
    assert.equal(url.hostname, 'api.themoviedb.org');
    assert.equal(url.pathname, '/3/movie/550/videos');
    assert.equal(url.searchParams.get('api_key'), 'tmdb-test-secret');
    return new Response(JSON.stringify({ id: 550, results: [
      { site: 'Vimeo', type: 'Trailer', key: 'not-youtube1', official: true, name: 'Ignore other host' },
      { site: 'YouTube', type: 'Trailer', key: 'invalid-key', official: true, name: 'Invalid ID' },
      { site: 'YouTube', type: 'Teaser', key: 'TeaserKey01', official: true, name: 'Official teaser', iso_639_1: 'ru' },
      { site: 'YouTube', type: 'Trailer', key: 'AbCdEf12345', official: false, name: 'Unofficial trailer', iso_639_1: 'en' },
      { site: 'YouTube', type: 'Trailer', key: 'QwErTy12345', official: true, name: 'Официальный трейлер', iso_639_1: 'ru' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await originalFetch(`${base}/api/catalog/tmdb-movie-550/trailer`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.trailer, {
    key: 'QwErTy12345',
    name: 'Официальный трейлер',
    type: 'Trailer',
    official: true,
    sourceUrl: 'https://www.youtube.com/watch?v=QwErTy12345',
  });
  assert.match(payload.attribution, /TMDB/);
  assert.equal(JSON.stringify(payload).includes('tmdb-test-secret'), false);

  const invalid = await originalFetch(`${base}/api/catalog/not-a-tmdb-id/trailer`);
  assert.equal(invalid.status, 400);
});

test('TMDB trailer endpoint honestly returns null when no safe YouTube trailer or teaser exists', async (t) => {
  const originalFetch = globalThis.fetch;
  const config = readConfig({ TMDB_API_KEY: 'tmdb-test-secret' });
  const server = createApp({ config, pool: null, telegram: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  });

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href : String(input));
    if (url.hostname === '127.0.0.1') return originalFetch(input, init);
    return new Response(JSON.stringify({ results: [{ site: 'Vimeo', type: 'Trailer', key: 'VimeoKey1234', official: true }] }), { status: 200 });
  };

  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/catalog/tmdb-tv-8801/trailer`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.trailer, null);
});
