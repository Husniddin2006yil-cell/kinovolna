import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { searchYoutubeMusic, YouTubeApiError } from '../server/youtube.mjs';
import { testEnvironment } from './helpers.mjs';

test('YouTube search requests only region-visible embeddable video results and maps safe metadata', async () => {
  let requestUrl;
  const results = await searchYoutubeMusic('song artist', 'test-key', {
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return new Response(JSON.stringify({ items: [{
        id: { videoId: 'abcdefghijk' },
        snippet: { title: 'Song title', channelTitle: 'Artist', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' } } },
      }, { id: { videoId: 'not-valid' }, snippet: { title: 'bad', channelTitle: 'bad' } }] }), { status: 200 });
    },
  });
  assert.equal(requestUrl.origin, 'https://www.googleapis.com');
  assert.equal(requestUrl.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(requestUrl.searchParams.get('videoSyndicated'), 'true');
  assert.equal(requestUrl.searchParams.get('regionCode'), 'UZ');
  assert.equal(requestUrl.searchParams.get('q'), 'song artist');
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'abcdefghijk');
  assert.equal(results[0].artist, 'Artist');
  assert.equal(results[0].thumbnailUrl, 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
  assert.equal(results[0].videoUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(JSON.stringify(results).includes('test-key'), false);
});

test('YouTube API quota errors become a safe quota error without leaking provider payload', async () => {
  await assert.rejects(
    searchYoutubeMusic('song', 'test-key', { fetchImpl: async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }], message: 'secret-key-hidden' } }), { status: 403 }) }),
    (error) => error instanceof YouTubeApiError && error.code === 'youtube_quota_exceeded' && !error.message.includes('secret-key-hidden'),
  );
});

test('YouTube search endpoint reports missing key without breaking health and public config', async (t) => {
  const config = readConfig(testEnvironment({ YOUTUBE_API_KEY: '' }));
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const [health, configResponse, search] = await Promise.all([
    fetch(`${base}/api/health`), fetch(`${base}/api/config`), fetch(`${base}/api/music/youtube?q=song`),
  ]);
  assert.equal(health.status, 200);
  assert.equal((await configResponse.json()).youtubeConfigured, false);
  assert.equal(search.status, 503);
  const failure = await search.json();
  assert.equal(failure.error.code, 'youtube_not_configured');
  assert.match(failure.error.message, /YOUTUBE_API_KEY/);
});
