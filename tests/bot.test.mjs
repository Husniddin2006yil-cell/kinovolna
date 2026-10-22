import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { setTelegramWebhookOnlyIfEmpty } from '../server/telegram-webhook.mjs';
import { signInitData, testBotToken, testEnvironment, testUser, testWebhookSecret } from './helpers.mjs';

const welcome = 'Добро пожаловать в КИНОВОЛНА! 🍿 Твой мир кино и музыки начинается здесь. Открывай фильмы и сериалы, находи любимые истории и исследуй мир музыки. Готов выбрать, что посмотреть сегодня?';

function createTelegramStub({ membership = 'administrator', webhookInfo = { url: 'https://kinovolna-test.app/api/telegram/webhook', pending_update_count: 0, allowed_updates: ['message', 'channel_post'] } } = {}) {
  const sent = [];
  const calls = [];
  return {
    sent,
    calls,
    setMembership(value) { membership = value; },
    client: {
      sendMessage: async (chatId, text, options = {}) => {
        sent.push({ chatId, text, options });
        return { message_id: sent.length };
      },
      call: async (method, parameters = {}) => {
        calls.push({ method, parameters });
        return true;
      },
      copyMessage: async (chatId, fromChatId, messageId, options = {}) => {
        calls.push({ method: 'copyMessage', parameters: { chatId, fromChatId, messageId, ...options } });
        return { message_id: calls.length };
      },
      getMe: async () => ({ id: 900001, username: 'kinovolna_test_bot' }),
      getChat: async () => ({ type: 'channel', title: 'Test Channel' }),
      getChatMember: async () => ({ status: membership }),
      getWebhookInfo: async () => webhookInfo,
      setWebhook: async (parameters) => {
        calls.push({ method: 'setWebhook', parameters });
        return true;
      },
      getFile: async (fileId) => {
        calls.push({ method: 'getFile', parameters: { file_id: fileId } });
        return { file_path: 'photos/poster.jpg' };
      },
    },
  };
}

function createPool(filmCount = '0', films = []) {
  const statements = [];
  const client = {
    async query(sql, parameters = []) {
      const statement = String(sql).replace(/\s+/g, ' ').trim();
      statements.push({ statement, parameters });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [] };
      if (statement.startsWith('INSERT INTO telegram_updates')) return { rows: [{ update_id: parameters[0] }] };
      if (statement.includes('position(lower($2) in lower(title))')) {
        const query = String(parameters[1] ?? '').toLowerCase();
        return { rows: films.filter((film) => film.title.toLowerCase().includes(query)).sort((a, b) => Number(b.title.toLowerCase() === query) - Number(a.title.toLowerCase() === query)).slice(0, 9) };
      }
      if (statement.startsWith('SELECT id, title, channel_id, message_id, channel_username, video_file_id FROM films WHERE id = $1') || statement.startsWith('SELECT id, title, year, kind, channel_id, message_id, channel_username, video_file_id FROM films WHERE id = $1')) {
        return { rows: films.filter((film) => film.id === parameters[0] && film.channel_id === parameters[1]) };
      }
      if (statement.startsWith('SELECT id, title, description, channel_id, message_id, channel_username, source_date, year') && statement.includes('WHERE channel_id = $1::bigint')) {
        return { rows: films.filter((film) => film.channel_id === parameters[0]) };
      }
      if (statement.startsWith('SELECT id, title, description, channel_id, message_id, channel_username, source_date') && statement.includes('WHERE id = $1')) {
        return { rows: films.filter((film) => film.id === parameters[0] && film.channel_id === parameters[1]) };
      }
      if (statement.includes('SELECT COUNT(*)::bigint AS total')) return { rows: [{ total: filmCount }] };
      if (statement.includes('SELECT COUNT(*)::bigint AS films')) return { rows: [{ films: filmCount }] };
      if (statement === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
    release() {},
  };
  return { statements, connect: async () => client, query: client.query.bind(client) };
}

async function serve(t, { environment = {}, pool = null, membership = 'administrator', webhookInfo } = {}) {
  const telegram = createTelegramStub({ membership, ...(webhookInfo ? { webhookInfo } : {}) });
  const config = readConfig(testEnvironment({ PUBLIC_BASE_URL: 'https://kinovolna-test.app', ...environment }));
  const server = createApp({ config, pool, telegram: telegram.client }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, ...telegram };
}

async function deliver(base, update) {
  return fetch(`${base}/api/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': testWebhookSecret,
    },
    body: JSON.stringify(update),
  });
}

function messageUpdate(updateId, user, text) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: user.id, type: 'private' },
      from: user,
      text,
    },
  };
}

function callbackUpdate(updateId, user, data) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: user,
      message: { message_id: updateId, chat: { id: user.id, type: 'private' } },
      data,
    },
  };
}

test('webhook /start works without database and uses only a configured HTTPS Mini App URL', async (t) => {
  const { base, sent } = await serve(t, {
    environment: {
      DATABASE_URL: '',
      TELEGRAM_CHANNEL_ID: '',
      MINI_APP_URL: 'https://kinovolna-test.app/',
    },
  });
  const response = await deliver(base, messageUpdate(1, testUser, '/start@kinovolna_test_bot'));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, welcome);
  assert.deepEqual(sent[0].options.reply_markup, {
    inline_keyboard: [[{
      text: '🎬 Открыть КИНОВОЛНУ',
      web_app: { url: 'https://kinovolna-test.app/' },
    }]],
  });
});

test('/start explains a missing Mini App URL without inventing a link', async (t) => {
  const { base, sent } = await serve(t, {
    environment: { DATABASE_URL: '', TELEGRAM_CHANNEL_ID: '', MINI_APP_URL: '' },
  });
  const response = await deliver(base, messageUpdate(2, testUser, '/start'));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.startsWith(welcome));
  assert.match(sent[0].text, /MINI_APP_URL/);
  assert.deepEqual(sent[0].options, {});
});

test('/help, /id, and an unknown command respond without database setup', async (t) => {
  const { base, sent } = await serve(t, {
    environment: { DATABASE_URL: '', TELEGRAM_CHANNEL_ID: '', MINI_APP_URL: '' },
  });
  assert.equal((await deliver(base, messageUpdate(3, testUser, '/help@kinovolna_test_bot'))).status, 200);
  assert.equal((await deliver(base, messageUpdate(4, testUser, '/id'))).status, 200);
  assert.equal((await deliver(base, messageUpdate(5, testUser, '/wat@kinovolna_test_bot'))).status, 200);
  assert.match(sent[0].text, /\/start.*\/help.*\/id/s);
  assert.equal(sent[1].text, `Ваш Telegram ID: ${testUser.id}`);
  assert.match(sent[2].text, /Неизвестная команда/);
});

test('admin menu and every callback recheck the Telegram ID allowlist', async (t) => {
  const { base, sent, calls } = await serve(t, {
    environment: { DATABASE_URL: '', TELEGRAM_CHANNEL_ID: '', MINI_APP_URL: '' },
  });
  const regularUser = { id: 123456, first_name: 'Regular' };
  assert.equal((await deliver(base, messageUpdate(6, regularUser, '/admin'))).status, 200);
  assert.match(sent.at(-1).text, /нет доступа/);

  assert.equal((await deliver(base, messageUpdate(7, testUser, '/admin'))).status, 200);
  assert.match(sent.at(-1).text, /Панель администратора/);
  assert.equal(sent.at(-1).options.reply_markup.inline_keyboard.length, 2);

  assert.equal((await deliver(base, callbackUpdate(8, regularUser, 'admin_stats'))).status, 200);
  assert.match(sent.at(-1).text, /нет доступа/);
  assert.ok(calls.some(({ method }) => method === 'answerCallbackQuery'));

  assert.equal((await deliver(base, callbackUpdate(9, testUser, 'admin_catalog'))).status, 200);
  assert.match(sent.at(-1).text, /база данных или Telegram-канал ещё не настроены/);
  assert.doesNotMatch(sent.at(-1).text, /\b\d+\s+запис/);

  assert.equal((await deliver(base, callbackUpdate(10, testUser, 'admin_stats'))).status, 200);
  assert.match(sent.at(-1).text, /Фиктивные цифры не показываются/);
});

test('admin health checks the Bot API and channel administrator access instead of assuming success', async (t) => {
  const { base, sent } = await serve(t, {
    environment: { DATABASE_URL: '', MINI_APP_URL: 'https://kinovolna-test.app' },
  });
  const response = await deliver(base, callbackUpdate(12, testUser, 'admin_health'));
  assert.equal(response.status, 200);
  assert.match(sent.at(-1).text, /Telegram Bot API: отвечает как @kinovolna_test_bot/);
  assert.match(sent.at(-1).text, /канал: бот — администратор/);
  assert.match(sent.at(-1).text, /Mini App URL: настроен/);
});

test('channel posts are not acknowledged before database and channel configuration exist', async (t) => {
  const { base } = await serve(t, {
    environment: { DATABASE_URL: '', TELEGRAM_CHANNEL_ID: '' },
  });
  const response = await deliver(base, {
    update_id: 13,
    channel_post: {
      message_id: 13,
      date: Math.floor(Date.now() / 1000),
      chat: { id: '-1001234567890', type: 'channel', title: 'Test channel' },
      text: 'Демо публикация',
    },
  });
  assert.equal(response.status, 503);
});

const botFilm = (id, title, messageId) => ({
  id,
  title,
  year: 2014,
  kind: 'Фильм',
  channel_id: '-1001234567890',
  message_id: messageId,
  channel_username: null,
  video_file_id: `file-${messageId}`,
});

test('private chat title search sends one matching channel video with a plain clean copy', async (t) => {
  const film = botFilm('11111111-1111-4111-8111-111111111111', 'Interstellar — @kinovolna https://t.me/kinovolna/41', 41);
  const { base, sent, calls } = await serve(t, { pool: createPool('1', [film]) });
  const response = await deliver(base, messageUpdate(20, testUser, 'interstellar'));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 0);
  assert.deepEqual(calls.find((call) => call.method === 'copyMessage')?.parameters, {
    chatId: testUser.id,
    fromChatId: film.channel_id,
    messageId: film.message_id,
    protect_content: true,
    caption: 'Interstellar',
    caption_entities: [],
    reply_markup: { inline_keyboard: [] },
  });
  assert.equal(calls.some((call) => call.method === 'forwardMessage'), false);
});

test('ambiguous bot title search offers private selection buttons and copies the selected movie', async (t) => {
  const first = botFilm('11111111-1111-4111-8111-111111111111', 'Dune', 42);
  const second = botFilm('22222222-2222-4222-8222-222222222222', 'Dune: Part Two', 43);
  const { base, sent, calls } = await serve(t, { pool: createPool('2', [first, second]) });
  assert.equal((await deliver(base, messageUpdate(21, testUser, 'Dune'))).status, 200);
  const buttons = sent.at(-1).options.reply_markup.inline_keyboard;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[1][0].callback_data, `filmselect_${second.id}`);
  assert.equal((await deliver(base, callbackUpdate(22, testUser, buttons[1][0].callback_data))).status, 200);
  const copied = calls.find((call) => call.method === 'copyMessage' && call.parameters.messageId === second.message_id);
  assert.equal(copied?.parameters.caption, second.title);
});

test('/start film copies the protected video with a plain caption and no source keyboard', async (t) => {
  const film = botFilm('11111111-1111-4111-8111-111111111111', 'The Thing — Переслано от @movie_archive https://example.test/post', 47);
  const { base, sent, calls } = await serve(t, { pool: createPool('1', [film]) });
  const response = await deliver(base, messageUpdate(27, testUser, `/start film_${film.id}`));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 0);
  const copied = calls.find((call) => call.method === 'copyMessage');
  assert.deepEqual(copied?.parameters, {
    chatId: testUser.id,
    fromChatId: film.channel_id,
    messageId: film.message_id,
    protect_content: true,
    caption: 'The Thing',
    caption_entities: [],
    reply_markup: { inline_keyboard: [] },
  });
  assert.equal('parse_mode' in copied.parameters, false);
  assert.equal(calls.some((call) => call.method === 'forwardMessage'), false);
});

test('bot title search reports no match and does not reveal results to an unsubscribed user', async (t) => {
  const film = botFilm('11111111-1111-4111-8111-111111111111', 'Interstellar', 44);
  const noMatch = await serve(t, { pool: createPool('1', [film]) });
  assert.equal((await deliver(noMatch.base, messageUpdate(23, testUser, 'No such movie'))).status, 200);
  assert.match(noMatch.sent.at(-1).text, /Кино не найдено, проверьте название/);

  const denied = await serve(t, { pool: createPool('1', [film]), membership: 'left' });
  assert.equal((await deliver(denied.base, messageUpdate(24, testUser, 'Interstellar'))).status, 200);
  assert.match(denied.sent.at(-1).text, /подпишитесь на канал/);
  assert.doesNotMatch(denied.sent.at(-1).text, /Interstellar/);
});

test('subscription prompt links to the channel and rechecks membership from a private callback', async (t) => {
  const film = botFilm('11111111-1111-4111-8111-111111111111', 'Interstellar', 45);
  const { base, sent, calls, setMembership } = await serve(t, {
    pool: createPool('1', [film]),
    membership: 'left',
    environment: { TELEGRAM_CHANNEL_INVITE_URL: 'https://t.me/+kinovolna_test_invite' },
  });
  assert.equal((await deliver(base, messageUpdate(25, testUser, 'Interstellar'))).status, 200);
  const keyboard = sent.at(-1).options.reply_markup.inline_keyboard;
  assert.equal(keyboard[0][0].url, 'https://t.me/+kinovolna_test_invite');
  assert.equal(keyboard[1][0].callback_data, 'membership_recheck');
  setMembership('member');
  assert.equal((await deliver(base, callbackUpdate(26, testUser, 'membership_recheck'))).status, 200);
  assert.match(sent.at(-1).text, /Подписка подтверждена/);
  assert.ok(calls.some((call) => call.method === 'answerCallbackQuery'));
});

test('telegram diagnostics are admin-only and redact webhook error details', async (t) => {
  const tokenLike = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef';
  const { base } = await serve(t, {
    webhookInfo: {
      url: 'https://kinovolna-test.app/api/telegram/webhook',
      pending_update_count: 3,
      allowed_updates: ['message', 'channel_post'],
      last_error_date: 1_760_000_000,
      last_error_message: `401 Unauthorized; rejected token=${tokenLike} at https://private.example/hook?secret=hidden`,
    },
  });
  const endpoint = `${base}/api/admin/telegram/diagnostics`;
  assert.equal((await fetch(endpoint)).status, 401);
  const notAdmin = await fetch(endpoint, { headers: { 'X-Telegram-Init-Data': signInitData({ user: { id: 111, first_name: 'Visitor' } }) } });
  assert.equal(notAdmin.status, 403);

  const response = await fetch(endpoint, { headers: { 'X-Telegram-Init-Data': signInitData() } });
  assert.equal(response.status, 200);
  const diagnostics = await response.json();
  assert.equal(diagnostics.botApiReachable, true);
  assert.equal(diagnostics.botIsChannelAdmin, true);
  assert.equal(diagnostics.webhook.configured, true);
  assert.equal(diagnostics.webhook.matchesExpectedUrl, true);
  assert.equal(diagnostics.webhook.pendingUpdateCount, 3);
  assert.match(diagnostics.webhook.lastErrorMessage, /401 Unauthorized/);
  assert.doesNotMatch(JSON.stringify(diagnostics), new RegExp(tokenLike));
  assert.doesNotMatch(diagnostics.webhook.lastErrorMessage, /private\.example|hidden/);
});

test('safe webhook setup only creates a missing webhook and never replaces an existing URL', async () => {
  const secret = 'test_webhook_secret_123456789';
  const config = readConfig(testEnvironment({
    PUBLIC_BASE_URL: 'https://kinovolna-test.app',
    TELEGRAM_WEBHOOK_SECRET: secret,
  }));
  const target = 'https://kinovolna-test.app/api/telegram/webhook';

  const empty = createTelegramStub({ webhookInfo: { url: '' } });
  assert.deepEqual(await setTelegramWebhookOnlyIfEmpty(config, empty.client), { status: 'configured', changed: true });
  assert.deepEqual(empty.calls.filter((call) => call.method === 'setWebhook').map((call) => call.parameters), [{
    url: target,
    secret_token: secret,
    allowed_updates: ['channel_post', 'edited_channel_post', 'message', 'callback_query'],
    drop_pending_updates: false,
  }]);

  const same = createTelegramStub({ webhookInfo: { url: target } });
  assert.deepEqual(await setTelegramWebhookOnlyIfEmpty(config, same.client), { status: 'already_configured', changed: false });
  assert.equal(same.calls.some((call) => call.method === 'setWebhook'), false);

  const other = createTelegramStub({ webhookInfo: { url: 'https://other.example/webhook' } });
  await assert.rejects(setTelegramWebhookOnlyIfEmpty(config, other.client), /refusing to replace it/);
  assert.equal(other.calls.some((call) => call.method === 'setWebhook'), false);
});

test('channel media-group updates retain both the movie caption and Telegram poster/video IDs', async (t) => {
  const pool = createPool();
  const { base } = await serve(t, { pool });
  const date = Math.floor(Date.now() / 1000);
  const photoUpdate = {
    update_id: 30,
    channel_post: {
      message_id: 30, date, chat: { id: '-1001234567890', type: 'channel' },
      media_group_id: 'media-group-30', caption: 'The Example Film\nDescription',
      photo: [{ file_id: 'poster-small' }, { file_id: 'poster-large' }],
    },
  };
  const videoUpdate = {
    update_id: 31,
    channel_post: {
      message_id: 31, date, chat: { id: '-1001234567890', type: 'channel' },
      media_group_id: 'media-group-30', video: { file_id: 'video-file', thumbnail: { file_id: 'video-thumbnail' }, file_size: 1200 },
    },
  };
  assert.equal((await deliver(base, photoUpdate)).status, 200);
  assert.equal((await deliver(base, videoUpdate)).status, 200);
  const writes = pool.statements.filter(({ statement }) => statement.startsWith('INSERT INTO films'));
  assert.equal(writes.length, 2);
  assert.ok(writes.every(({ statement }) => statement.includes('ON CONFLICT (channel_id, media_group_id)')));
  assert.equal(writes[0].parameters[1], 'The Example Film');
  assert.equal(writes[0].parameters[12], 'poster-large');
  assert.equal(writes[0].parameters[13], 'media-group-30');
  assert.equal(writes[1].parameters[8], 'video-file');
  assert.equal(writes[1].parameters[12], 'video-thumbnail');
});

test('film API returns a signed poster proxy and never exposes Telegram file URLs', async (t) => {
  const film = { ...botFilm('11111111-1111-4111-8111-111111111111', 'Interstellar', 46), poster_file_id: 'poster-private-file', poster: '/favicon.svg' };
  const { base, calls } = await serve(t, { pool: createPool('1', [film]) });
  const auth = { 'X-Telegram-Init-Data': signInitData() };
  const listing = await fetch(`${base}/api/films`, { headers: auth });
  assert.equal(listing.status, 200);
  const body = await listing.json();
  const poster = new URL(body.items[0].poster);
  assert.equal(poster.pathname, `/api/films/${film.id}/poster`);
  assert.ok(poster.searchParams.get('token'));
  assert.doesNotMatch(body.items[0].poster, /api\.telegram\.org|bot\d+:/);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === `https://api.telegram.org/file/bot${testBotToken}/photos/poster.jpg`) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '4' } });
    }
    return realFetch(input, init);
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const denied = await fetch(`${base}/api/films/${film.id}/poster?token=invalid`);
  assert.equal(denied.status, 401);
  const image = await fetch(`${base}${poster.pathname}${poster.search}`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/jpeg/);
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
  assert.ok(calls.some((call) => call.method === 'getFile' && call.parameters.file_id === 'poster-private-file'));
});

test('admin statistics report a real catalog count and do not call it view/search analytics', async (t) => {
  const { base, sent } = await serve(t, { pool: createPool('7') });
  const response = await deliver(base, callbackUpdate(11, testUser, 'admin_stats'));
  assert.equal(response.status, 200);
  assert.match(sent.at(-1).text, /Фильмов и сериалов в базе: 7/);
  assert.doesNotMatch(sent.at(-1).text, /просмотр|поиск|прослушив/);
});
