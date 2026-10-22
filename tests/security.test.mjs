import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readConfig } from '../server/config.mjs';
import { createApp, verifyTelegramInitData } from '../server/app.mjs';
import { createTelegramClient, TelegramApiError } from '../server/telegram.mjs';
import { movieCopyOptions } from '../server/movie-caption.mjs';
import { signInitData, testBotToken, testUser, testEnvironment } from './helpers.mjs';

const now = 1800000000;
const signed = (options = {}) => signInitData({ authDate: now, ...options });
const verify = (data, token = testBotToken) => verifyTelegramInitData(data, token, 3600, now);
const unauthorized = (operation) => assert.throws(operation, (error) => error.status === 401);

test('valid Telegram HMAC returns only signed, sanitized user fields', () => {
  const result = verify(signed({ user: { ...testUser, is_admin: true }, fields: { start_param: 'film_example' } }));
  assert.deepEqual(result.user, testUser);
  assert.equal(result.startParam, 'film_example');
  assert.equal(result.authDate, now);
  assert.equal(result.user.is_admin, undefined);
});

test('Telegram signature field participates in bot-token HMAC', () => {
  const value = signed({ fields: { signature: 'test-ed25519-field', query_id: 'test_query' } });
  assert.equal(verify(value).user.id, testUser.id);
  unauthorized(() => verify(value.replace('test-ed25519-field', 'tampered-signature')));
});

test('modified user data and wrong token are rejected', () => {
  const params = new URLSearchParams(signed());
  params.set('user', JSON.stringify({ ...testUser, id: 1 }));
  unauthorized(() => verify(params.toString()));
  unauthorized(() => verify(signed(), 'not-a-real-token'));
});

test('expired, future, invalid and unsigned initData cannot authenticate', () => {
  unauthorized(() => verify(signed({ authDate: now - 3601 })));
  unauthorized(() => verify(signed({ authDate: now + 31 })));
  unauthorized(() => verify(signed({ fields: { auth_date: 'NaN' } })));
  unauthorized(() => verify('user=%7B%7D'));
  unauthorized(() => verify(''));
});

test('duplicate keys, bad encoding and bad hashes are rejected', () => {
  unauthorized(() => verify(`${signed()}&user=${encodeURIComponent(JSON.stringify(testUser))}`));
  unauthorized(() => verify(`${signed()}&%75ser=duplicate`));
  unauthorized(() => verify(`${signed()}&extra=%XX`));
  const params = new URLSearchParams(signed());
  params.set('hash', 'invalid');
  unauthorized(() => verify(params.toString()));
});

test('positive safe numeric Telegram user ID is mandatory', () => {
  for (const id of [-1, 0, '424242', Number.MAX_SAFE_INTEGER + 1]) {
    unauthorized(() => verify(signed({ user: { ...testUser, id } })));
  }
  unauthorized(() => verify(signed({ user: { id: 1, first_name: '' } })));
});

test('invalid or browser-supplied secrets cannot configure the backend', () => {
  const config = readConfig({ VITE_TELEGRAM_BOT_TOKEN: 'not-a-live-token', DATABASE_URL: 'sqlite:test', TELEGRAM_CHANNEL_ID: '@wrong', TELEGRAM_BOT_USERNAME: 'evil/path', APP_ORIGIN: '*' });
  assert.equal(config.telegramConfigured, false);
  assert.equal(config.databaseConfigured, false);
  assert.equal(config.channelConfigured, false);
  assert.equal(config.telegramBotUsername, null);
  assert.deepEqual(config.appOrigins, []);
});

test('unconfigured API is honest, protected, JSON-only and does not expose secrets', async (t) => {
  const server = createApp({ config: readConfig({}), pool: null, telegram: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/ready`)).status, 503);
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { telegramConfigured: false, databaseConfigured: false, channelConfigured: false, audioRecognitionConfigured: false, tmdbConfigured: false, youtubeConfigured: false });
  for (const path of ['/api/films', '/api/films/example/telegram']) assert.equal((await fetch(`${base}${path}`)).status, 503);
  const response = await fetch(`${base}/api/telegram/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: signed() }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'configuration_required');
  const unknown = await fetch(`${base}/api/not-a-real-route`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/);
});

test('HTTP responses explicitly allow an origin-only cross-origin referrer', async (t) => {
  const server = createApp({ config: readConfig({}), pool: null, telegram: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('music recognition preserves the real audio container and maps AudD errors safely', async (t) => {
  const server = createApp({ config: readConfig({ AUDIO_RECOGNITION_API_KEY: 'server-only-test-token' }), pool: null, telegram: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  const warnings = [];
  const originalWarn = console.warn;
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048, 7)]);
  let uploaded;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://api.audd.io/') return realFetch(input, init);
    uploaded = init.body.get('file');
    return new Response(JSON.stringify({ status: 'success', result: { artist: 'Test Artist', title: 'Test Song' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  console.warn = (...args) => warnings.push(args);
  t.after(() => { globalThis.fetch = realFetch; console.warn = originalWarn; });

  const success = await fetch(`${base}/api/music/recognize`, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: webm });
  assert.equal(success.status, 200);
  assert.equal(uploaded.name, 'kinovolna-sample.webm');
  assert.equal(uploaded.type, 'audio/webm');
  assert.equal((await success.json()).matched, true);

  for (const [code, message] of [['900', 'Ключ AudD'], ['902', 'Ключ AudD'], ['700', 'корректный аудиофайл'], ['500', 'прочитать аудиофайл'], ['300', 'слишком короткий']]) {
    globalThis.fetch = async (input, init) => {
      if (String(input) !== 'https://api.audd.io/') return realFetch(input, init);
      return new Response(JSON.stringify({ status: 'error', error: { error_code: code, error_message: `provider detail ${code}` } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const response = await fetch(`${base}/api/music/recognize`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: webm });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error.message, new RegExp(message));
    assert.equal(warnings.at(-1)[1].error_code, code);
    assert.equal(warnings.at(-1)[1].error_message, `provider detail ${code}`);
    assert.doesNotMatch(JSON.stringify(warnings.at(-1)), /server-only-test-token/);
  }

  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://api.audd.io/') return realFetch(input, init);
    return new Response(JSON.stringify({ status: 'error', error: { error_code: '902', error_message: 'Recognition failed: authorization=[redacted] the limit was reached.' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exhausted = await fetch(`${base}/api/music/recognize`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: webm });
  assert.equal(exhausted.status, 502);
  assert.match((await exhausted.json()).error.message, /Лимит запросов AudD исчерпан/);
  assert.equal(warnings.at(-1)[1].error_code, '902');
  assert.doesNotMatch(JSON.stringify(warnings.at(-1)), /server-only-test-token/);
});

test('configured auth endpoint verifies signed body without trusting user JSON', async (t) => {
  const server = createApp({ config: readConfig(testEnvironment()), telegram: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/telegram/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: signInitData(), user: { id: 1 } }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, testUser.id);
  const invalid = await fetch(`${base}/api/telegram/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
  const allowed = await fetch(`${base}/api/config`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const denied = await fetch(`${base}/api/config`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('Telegram transport sanitizes fetch errors containing token URLs', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(`Network failure https://api.telegram.org/bot${testBotToken}/getMe`); };
  try {
    await assert.rejects(createTelegramClient(testBotToken).getMe(), (error) => error instanceof TelegramApiError && !error.message.includes(testBotToken));
  } finally {
    globalThis.fetch = original;
  }
});

test('Telegram copyMessage sends clean movie options unchanged in the Bot API request', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), method: init.method, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await createTelegramClient(testBotToken).copyMessage(424242, '-1001234567890', 55, movieCopyOptions('The Matrix — @kinovolna https://t.me/kinovolna/55'));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request.url.endsWith('/copyMessage'), true);
  assert.deepEqual(request, {
    url: request.url,
    method: 'POST',
    body: {
      chat_id: 424242,
      from_chat_id: '-1001234567890',
      message_id: 55,
      protect_content: true,
      caption: 'The Matrix',
      caption_entities: [],
      reply_markup: { inline_keyboard: [] },
    },
  });
  assert.equal('parse_mode' in request.body, false);
});
