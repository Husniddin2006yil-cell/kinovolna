import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

test('TMDB watch-provider route returns country-specific official links and JustWatch attribution', async (t) => {
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
    assert.equal(url.pathname, '/3/movie/550/watch/providers');
    assert.equal(url.searchParams.get('api_key'), 'tmdb-test-secret');
    return new Response(JSON.stringify({ results: {
      UZ: {
        link: 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=UZ',
        flatrate: [{ provider_name: 'Example Stream' }],
        rent: [{ provider_name: 'Example Rental' }],
      },
      US: {
        link: 'https://evil.example/watch',
        flatrate: [{ provider_name: 'Untrusted Provider' }],
      },
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await originalFetch(`${base}/api/catalog/tmdb-movie-550/watch-providers?region=uz`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.provider, 'TMDB / JustWatch');
  assert.equal(payload.region, 'UZ');
  assert.equal(payload.link, 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=UZ');
  assert.deepEqual(payload.providers, [
    { name: 'Example Stream', category: 'subscription' },
    { name: 'Example Rental', category: 'rent' },
  ]);
  assert.match(payload.attribution, /JustWatch/);
  assert.equal(JSON.stringify(payload).includes('tmdb-test-secret'), false);

  const invalidId = await originalFetch(`${base}/api/catalog/not-a-tmdb-id/watch-providers`);
  assert.equal(invalidId.status, 400);
  const invalidRegion = await originalFetch(`${base}/api/catalog/tmdb-movie-550/watch-providers?region=USA`);
  assert.equal(invalidRegion.status, 400);
  const unsafeLink = await originalFetch(`${base}/api/catalog/tmdb-movie-550/watch-providers?region=US`);
  assert.equal((await unsafeLink.json()).link, null);
});
