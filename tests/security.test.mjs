import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readConfig } from '../server/config.mjs';
import { createApp, verifyTelegramInitData } from '../server/app.mjs';
import { createTelegramClient, TelegramApiError } from '../server/telegram.mjs';
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
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { telegramConfigured: false, databaseConfigured: false, channelConfigured: false });
  for (const path of ['/api/films', '/api/films/example/telegram']) assert.equal((await fetch(`${base}${path}`)).status, 503);
  const response = await fetch(`${base}/api/telegram/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: signed() }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'configuration_required');
  const unknown = await fetch(`${base}/api/not-a-real-route`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/);
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
