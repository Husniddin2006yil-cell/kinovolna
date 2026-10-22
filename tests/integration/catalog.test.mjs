import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readConfig } from '../../server/config.mjs';
import { createApp } from '../../server/app.mjs';
import { migrate } from '../../server/db.mjs';
import { signInitData, testUser, testChannel, testWebhookSecret, testEnvironment } from '../helpers.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('real PostgreSQL integration; Telegram network is explicitly a test double', { skip: !databaseUrl }, async (t) => {
  const schema = `kinovolna_test_${randomUUID().replaceAll('-', '')}`;
  const setupPool = new Pool({ connectionString: databaseUrl });
  // Use TEST_DATABASE_URL only; production DATABASE_URL is never used by tests.
  await setupPool.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 6 });
  const config = readConfig(testEnvironment({ DATABASE_URL: databaseUrl }));
  const state = { membership: 'member', upstreamFails: false, sent: [], copied: [] };
  const telegram = {
    async getChatMember(channelId, userId) {
      assert.equal(String(channelId), testChannel);
      assert.equal(Number(userId), testUser.id);
      if (state.upstreamFails) throw new Error('Explicitly simulated Telegram outage');
      return { status: state.membership, is_member: state.membership === 'restricted' };
    },
    async sendMessage(chatId, text, options = {}) {
      state.sent.push({ chatId, text, options });
      return { message_id: state.sent.length };
    },
    async copyMessage(chatId, fromChatId, messageId, options = {}) {
      state.copied.push({ chatId, fromChatId, messageId, options });
      return { message_id: state.copied.length };
    },
  };
  await migrate(pool);
  await migrate(pool);
  const server = createApp({ config, pool, telegram }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    // Only the unique test schema is removed; no application/user data is touched.
    await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await setupPool.end();
  });

  const authHeaders = { 'X-Telegram-Init-Data': signInitData() };
  const api = (path, options = {}) => fetch(`${base}${path}`, { ...options, headers: { ...authHeaders, ...options.headers } });
  const post = (body, secret = testWebhookSecret) => fetch(`${base}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(body) });
  const update = (updateId, text = 'Haqiqiy test filmi\nBirinchi tavsif', messageId = 55, channelId = testChannel, key = 'channel_post') => ({ update_id: updateId, [key]: { message_id: messageId, date: Math.floor(Date.now() / 1000), chat: { id: Number(channelId), type: 'channel', title: 'Test channel' }, video: { file_id: 'test-file' }, caption: text } });
  let filmId;

  await t.test('health and real database readiness are separate', async () => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/ready`)).status, 200);
    const configResponse = await (await fetch(`${base}/api/config`)).json();
    assert.deepEqual(configResponse, { telegramConfigured: true, databaseConfigured: true, channelConfigured: true, audioRecognitionConfigured: false, tmdbConfigured: false });
    assert.equal(JSON.stringify(configResponse).includes(testWebhookSecret), false);
  });

  await t.test('webhook requires its secret and valid update shape', async () => {
    assert.equal((await post(update(1), 'wrong')).status, 401);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ update_id: 1, channel_post: {} })).status, 400);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM films')).rows[0].n, 0);
  });

  await t.test('only the configured channel is indexed', async () => {
    const response = await post(update(2, 'Other channel', 55, '-1009988776655'));
    assert.equal(response.status, 200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM films')).rows[0].n, 0);
  });

  await t.test('channel publication persists title, description, channel and message IDs', async () => {
    assert.equal((await post(update(3))).status, 200);
    const rows = (await pool.query('SELECT * FROM films')).rows;
    assert.equal(rows.length, 1);
    filmId = rows[0].id;
    assert.equal(rows[0].title, 'Haqiqiy test filmi');
    assert.equal(rows[0].description, 'Birinchi tavsif');
    assert.equal(String(rows[0].channel_id), testChannel);
    assert.equal(String(rows[0].message_id), '55');
  });

  await t.test('duplicate/concurrent updates are idempotent and edits preserve film UUID', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => post(update(3))));
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM films')).rows[0].n, 1);
    assert.equal((await post(update(5, 'Tahrirlangan film\nYangi tavsif', 55, testChannel, 'edited_channel_post'))).status, 200);
    assert.equal((await post(update(4, 'Eski tahrir\nOrqaga qaytmasin', 55, testChannel, 'edited_channel_post'))).status, 200);
    const row = (await pool.query('SELECT * FROM films')).rows[0];
    assert.equal(row.id, filmId);
    assert.equal(row.title, 'Tahrirlangan film');
    assert.equal(row.description, 'Yangi tavsif');
  });

  await t.test('private catalog refuses unsigned, nonmember and uncheckable access', async () => {
    assert.equal((await fetch(`${base}/api/films`)).status, 401);
    state.membership = 'left';
    assert.equal((await api('/api/films')).status, 403);
    assert.equal((await api(`/api/films/${filmId}/telegram`)).status, 403);
    state.membership = 'member';
    state.upstreamFails = true;
    assert.equal((await api('/api/films')).status, 503);
    state.upstreamFails = false;
  });

  await t.test('catalog search, pagination and exact film links work without fake video', async () => {
    const response = await api('/api/films?limit=1&offset=0&q=Tahrirlangan');
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.items.length, 1);
    assert.equal(page.pagination.total, 1);
    assert.equal(page.items[0].source, 'telegram');
    assert.equal(page.items[0].rating, '—');
    assert.equal(page.items[0].id, filmId);
    assert.equal((await api('/api/films?limit=101')).status, 400);
    assert.equal((await api('/api/films?offset=-1')).status, 400);
    const injected = await (await api(`/api/films?q=${encodeURIComponent("' OR 1=1; --")}`)).json();
    assert.equal(injected.items.length, 0);
    const link = await (await api(`/api/films/${filmId}/telegram`)).json();
    assert.equal(link.url, `https://t.me/kinovolna_test_bot?start=film_${filmId}`);
    assert.equal(link.mode, 'bot');
    const video = await api(`/api/films/${filmId}/playback`);
    assert.equal(video.status, 503);
    assert.equal((await video.json()).error.code, 'video_source_not_configured');
    assert.equal((await api('/api/films/orbit/telegram')).status, 404);
  });

  await t.test('bot /start film_UUID copies the original private channel video', async () => {
    const message = { update_id: 10, message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: testUser.id, type: 'private' }, from: testUser, text: `/start film_${filmId}` } };
    assert.equal((await post(message)).status, 200);
    assert.equal(state.copied.length, 1);
    assert.deepEqual(state.copied[0], { chatId: testUser.id, fromChatId: testChannel, messageId: '55', options: { protect_content: true } });
    assert.equal((await post(message)).status, 200);
    assert.equal(state.copied.length, 1);
    state.membership = 'left';
    assert.equal((await post({ ...message, update_id: 11 })).status, 200);
    assert.equal(state.sent.length, 1);
    assert.match(state.sent[0].text, /подпишитесь на канал/);
    state.membership = 'member';
  });

  await t.test('private bot message searches the PostgreSQL catalog by movie title', async () => {
    const updateMessage = { update_id: 12, message: { message_id: 12, date: Math.floor(Date.now() / 1000), chat: { id: testUser.id, type: 'private' }, from: testUser, text: 'Tahrirlangan film' } };
    assert.equal((await post(updateMessage)).status, 200);
    assert.equal(state.copied.length, 2);
    assert.equal(state.copied.at(-1).messageId, '55');
  });

  await t.test('admin import is authorized, additive, scoped and keeps existing UUID', async () => {
    const body = { items: [{ title: 'Import qilingan eski film', description: 'Qo‘lda kiritilgan tavsif', channelId: testChannel, messageId: 55, year: 2024, genre: 'Драма' }] };
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const nonadmin = await api('/api/admin/films/import', { ...options, headers: { ...options.headers, 'X-Telegram-Init-Data': signInitData({ user: { ...testUser, id: 123 } }) } });
    assert.equal(nonadmin.status, 403);
    assert.equal((await api('/api/admin/films/import', options)).status, 200);
    const row = (await pool.query('SELECT * FROM films')).rows[0];
    assert.equal(row.id, filmId);
    assert.equal(row.title, body.items[0].title);
    assert.equal(row.year, 2024);
    const bad = { items: [{ ...body.items[0], channelId: '-1001111111111' }] };
    assert.equal((await api('/api/admin/films/import', { ...options, body: JSON.stringify(bad) })).status, 400);
  });

  await t.test('database failures return errors, not fabricated catalog responses', async () => {
    const invalidPool = { query: async () => { throw new Error('Explicit test-only database outage'); } };
    const broken = createApp({ config, pool: invalidPool, telegram }).listen(0, '127.0.0.1');
    await once(broken, 'listening');
    try {
      const origin = `http://127.0.0.1:${broken.address().port}`;
      assert.equal((await fetch(`${origin}/api/ready`)).status, 503);
      const response = await fetch(`${origin}/api/films`, { headers: authHeaders });
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error.code, 'internal_error');
    } finally {
      await new Promise((resolve) => broken.close(resolve));
    }
  });
});
