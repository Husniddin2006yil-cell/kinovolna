import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createCommonsAudioSearch } from '../server/commons-audio.mjs';
import { readConfig } from '../server/config.mjs';

function searchFile(pageid, { name, mime = 'audio/mpeg', audioHost = 'upload.wikimedia.org' }) {
  const encodedName = encodeURIComponent(name);
  return {
    pageid,
    title: `File:${name}`,
    imageinfo: [{
      url: `https://${audioHost}/wikipedia/commons/a/a1/${encodedName}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodedName}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/${encodedName}`,
      mime,
    }],
  };
}

function metadataFile(pageid, { name, artist = 'Composer &amp; Artist', license = 'CC BY-SA 4.0', licenseUrl = 'https://creativecommons.org/licenses/by-sa/4.0/', mime = 'audio/mpeg', audioHost = 'upload.wikimedia.org' } = {}) {
  const encodedName = encodeURIComponent(name);
  return {
    pageid,
    title: `File:${name}`,
    imageinfo: [{
      url: `https://${audioHost}/wikipedia/commons/a/a1/${encodedName}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodedName}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/${encodedName}`,
      mime,
      duration: 73.8,
      extmetadata: {
        ObjectName: { value: '<span>Open recording</span>' },
        Artist: { value: artist },
        LicenseShortName: { value: license },
        LicenseUrl: { value: licenseUrl },
      },
    }],
  };
}

test('Commons search fetches lightweight candidates first and only returns compatible open-license audio with attribution', async () => {
  let searchUrl;
  let metadataUrl;
  let metadataAgent;
  const candidates = [
    searchFile(1, { name: 'open-recording.mp3' }),
    searchFile(2, { name: 'unsupported.ogg', mime: 'audio/ogg' }),
    searchFile(3, { name: 'nc-track.mp3' }),
    searchFile(4, { name: 'bad-host.mp3', audioHost: 'evil.example' }),
    searchFile(5, { name: 'missing-author.mp3' }),
    searchFile(6, { name: 'bad-license-link.mp3' }),
  ];
  const pages = [
    metadataFile(1, { name: 'open-recording.mp3' }),
    metadataFile(2, { name: 'unsupported.ogg', mime: 'audio/ogg' }),
    metadataFile(3, { name: 'nc-track.mp3', license: 'CC BY-NC 4.0' }),
    metadataFile(4, { name: 'bad-host.mp3', audioHost: 'evil.example' }),
    metadataFile(5, { name: 'missing-author.mp3', artist: '' }),
    metadataFile(6, { name: 'bad-license-link.mp3', licenseUrl: 'javascript:alert(1)' }),
  ];
  const search = createCommonsAudioSearch({
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://commons.wikimedia.org');
      assert.match(options.headers['User-Agent'], /KinovolnaAudioSearch/);
      if (parsed.searchParams.has('generator')) {
        searchUrl = parsed;
        return new Response(JSON.stringify({ query: { pages: candidates } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      metadataUrl = parsed;
      metadataAgent = options.headers['User-Agent'];
      return new Response(JSON.stringify({ query: { pages } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    cache: new Map(),
  });

  const items = await search('  open   recording  ');
  assert.equal(searchUrl.searchParams.get('action'), 'query');
  assert.equal(searchUrl.searchParams.get('gsrnamespace'), '6');
  assert.equal(searchUrl.searchParams.get('gsrsearch'), 'filetype:audio open recording');
  assert.equal(searchUrl.searchParams.get('iiprop'), 'url|mime');
  assert.equal(metadataUrl.searchParams.get('pageids'), '1|3|5|6');
  assert.equal(metadataUrl.searchParams.get('iiprop'), 'url|mime|extmetadata');
  assert.match(metadataUrl.searchParams.get('iiextmetadatafilter'), /LicenseShortName/);
  assert.match(metadataAgent, /KinovolnaAudioSearch/);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'commons');
  assert.equal(items[0].title, 'Open recording');
  assert.equal(items[0].artist, 'Composer & Artist');
  assert.equal(items[0].duration, '1:13');
  assert.equal(items[0].licenseName, 'CC BY-SA 4.0');
  assert.equal(items[0].audioUrl, 'https://upload.wikimedia.org/wikipedia/commons/a/a1/open-recording.mp3');
  assert.equal(items[0].sourceUrl, 'https://commons.wikimedia.org/wiki/File:open-recording.mp3');
  assert.equal(items[0].licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
});

test('Commons results are cached by normalized query and limit, and invalid queries do not call provider', async () => {
  let calls = 0;
  const search = createCommonsAudioSearch({
    fetchImpl: async (url) => {
      calls += 1;
      const parsed = new URL(url);
      const body = parsed.searchParams.has('generator')
        ? { query: { pages: [searchFile(1, { name: 'one.mp3' })] } }
        : { query: { pages: [metadataFile(1, { name: 'one.mp3' })] } };
      return new Response(JSON.stringify(body), { status: 200 });
    },
    now: () => 10_000,
    cache: new Map(),
  });
  assert.deepEqual(await search('x'), []);
  assert.equal(calls, 0);
  assert.equal((await search('open song')).length, 1);
  assert.equal((await search('  OPEN   SONG  ')).length, 1);
  assert.equal(calls, 2);
});

test('Commons provider errors never expose upstream text', async () => {
  const search = createCommonsAudioSearch({ fetchImpl: async () => new Response('secret provider detail', { status: 503 }), cache: new Map() });
  await assert.rejects(search('song'), (error) => error.code === 'music_source_unavailable' && !error.message.includes('secret provider detail'));
});

test('music search endpoint validates the query and returns provider results without requiring a key', async (t) => {
  const expected = {
    id: 'commons-test', title: 'Open recording', artist: 'Composer', album: 'Свободный аудиоархив', duration: '1:13',
    coverStyle: 'cover-blue', tone: 'CC BY-SA 4.0', licenseName: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    moods: [], audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/open.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:open.mp3', source: 'commons',
  };
  let receivedQuery;
  const server = createApp({ config: readConfig({}), musicSearch: async (query) => { receivedQuery = query; return [expected]; } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const invalid = await fetch(`${base}/api/music/search?q=x`);
  assert.equal(invalid.status, 400);
  const response = await fetch(`${base}/api/music/search?q=${encodeURIComponent('  open   song  ')}`);
  assert.equal(response.status, 200);
  assert.equal(receivedQuery, 'open song');
  assert.deepEqual((await response.json()).items, [expected]);
  const failed = await fetch(`${base}/api/music/youtube?q=song`);
  assert.equal(failed.status, 404);
});
