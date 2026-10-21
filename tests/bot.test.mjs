import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { testEnvironment, testUser, testWebhookSecret } from './helpers.mjs';

const welcome = 'Добро пожаловать в КИНОВОЛНА! 🍿 Твой мир кино и музыки начинается здесь. Открывай фильмы и сериалы, находи любимые истории и исследуй мир музыки. Готов выбрать, что посмотреть сегодня?';

function createTelegramStub() {
  const sent = [];
  const calls = [];
  return {
    sent,
    calls,
    client: {
      sendMessage: async (chatId, text, options = {}) => {
        sent.push({ chatId, text, options });
        return { message_id: sent.length };
      },
      call: async (method, parameters = {}) => {
        calls.push({ method, parameters });
        return true;
      },
      getMe: async () => ({ id: 900001, username: 'kinovolna_test_bot' }),
      getChatMember: async () => ({ status: 'administrator' }),
    },
  };
}

function createPool(filmCount = '0') {
  const client = {
    async query(sql, parameters = []) {
      const statement = String(sql).replace(/\s+/g, ' ').trim();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [] };
      if (statement.startsWith('INSERT INTO telegram_updates')) return { rows: [{ update_id: parameters[0] }] };
      if (statement.includes('SELECT COUNT(*)::bigint AS total')) return { rows: [{ total: filmCount }] };
      if (statement.includes('SELECT COUNT(*)::bigint AS films')) return { rows: [{ films: filmCount }] };
      if (statement === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client, query: client.query.bind(client) };
}

async function serve(t, { environment = {}, pool = null } = {}) {
  const telegram = createTelegramStub();
  const config = readConfig(testEnvironment(environment));
  const server = createApp({ config, pool, telegram: telegram.client }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, ...telegram };
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

test('admin statistics report a real catalog count and do not call it view/search analytics', async (t) => {
  const { base, sent } = await serve(t, { pool: createPool('7') });
  const response = await deliver(base, callbackUpdate(11, testUser, 'admin_stats'));
  assert.equal(response.status, 200);
  assert.match(sent.at(-1).text, /Фильмов и сериалов в базе: 7/);
  assert.doesNotMatch(sent.at(-1).text, /просмотр|поиск|прослушив/);
});
