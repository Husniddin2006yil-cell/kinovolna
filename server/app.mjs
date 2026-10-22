import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { readConfig } from './config.mjs';
import { createTelegramClient } from './telegram.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TELEGRAM_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const SAFE_TEXT_MAX = 10_000;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const BOT_WELCOME = 'Добро пожаловать в КИНОВОЛНА! 🍿 Твой мир кино и музыки начинается здесь. Открывай фильмы и сериалы, находи любимые истории и исследуй мир музыки. Готов выбрать, что посмотреть сегодня?';

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendError(response, status, code, message) {
  return response.status(status).json({ error: { code, message } });
}

function safeEqualText(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeQueryPart(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  }
}

/** Strictly parses Telegram initData and rejects duplicate or malformed fields. */
export function parseInitData(initData) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) {
    throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  }
  const fields = new Map();
  for (const part of initData.split('&')) {
    const separator = part.indexOf('=');
    if (separator <= 0) throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
    const key = decodeQueryPart(part.slice(0, separator));
    const value = decodeQueryPart(part.slice(separator + 1));
    if (!key || key.includes('\0') || value.includes('\0') || fields.has(key)) {
      throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
    }
    fields.set(key, value);
  }
  return fields;
}

/**
 * Verifies Telegram Mini App initData according to Telegram's HMAC protocol.
 * `signature`, when present, remains in the data-check string: only `hash` is excluded.
 */
export function verifyTelegramInitData(initData, token, maxAgeSeconds = 3600, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !token) throw new RequestError(503, 'configuration_required', 'Telegram не настроен.');
  const fields = parseInitData(initData);
  const receivedHash = fields.get('hash');
  const authDateValue = fields.get('auth_date');
  const userValue = fields.get('user');
  if (!receivedHash || !/^[a-fA-F0-9]{64}$/.test(receivedHash) || !authDateValue || !userValue) {
    throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  }

  const sorted = [...fields.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const computedHash = crypto.createHmac('sha256', secret).update(sorted).digest('hex');
  if (!safeEqualText(computedHash.toLowerCase(), receivedHash.toLowerCase())) {
    throw new RequestError(401, 'invalid_init_data', 'Подпись Telegram не прошла проверку.');
  }

  if (!/^\d+$/.test(authDateValue)) throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  const authDate = Number(authDateValue);
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
    throw new RequestError(401, 'expired_init_data', 'Срок действия данных Telegram истёк.');
  }

  let sourceUser;
  try {
    sourceUser = JSON.parse(userValue);
  } catch {
    throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  }
  if (!sourceUser || typeof sourceUser !== 'object' || !Number.isSafeInteger(sourceUser.id) || sourceUser.id <= 0 || typeof sourceUser.first_name !== 'string' || !sourceUser.first_name.trim()) {
    throw new RequestError(401, 'invalid_init_data', 'Некорректные данные Telegram.');
  }

  const user = { id: sourceUser.id, first_name: sourceUser.first_name };
  if (typeof sourceUser.last_name === 'string') user.last_name = sourceUser.last_name;
  if (typeof sourceUser.username === 'string') user.username = sourceUser.username;
  if (typeof sourceUser.photo_url === 'string') user.photo_url = sourceUser.photo_url;
  const startParam = fields.get('start_param');
  return { user, authDate, ...(typeof startParam === 'string' && startParam ? { startParam } : {}) };
}

function parsePagination(value, fallback, minimum, maximum, name) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new RequestError(400, 'invalid_pagination', `Параметр ${name} некорректен.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RequestError(400, 'invalid_pagination', `Параметр ${name} некорректен.`);
  }
  return parsed;
}

function parseIntegerString(value, { positive = false, channel = false, safe = false } = {}) {
  const stringValue = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : null;
  const pattern = channel ? /^-100\d+$/ : positive ? /^[1-9]\d*$/ : /^-?\d+$/;
  if (!stringValue || !pattern.test(stringValue)) return null;
  try {
    const parsed = BigInt(stringValue);
    if (parsed < -MAX_SIGNED_BIGINT - 1n || parsed > MAX_SIGNED_BIGINT || (safe && (parsed < -MAX_SAFE_INTEGER_BIGINT || parsed > MAX_SAFE_INTEGER_BIGINT))) return null;
  } catch {
    return null;
  }
  return stringValue;
}

function parseTelegramDate(value) {
  const raw = parseIntegerString(value, { positive: false });
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function isMember(member) {
  if (!member || typeof member !== 'object') return false;
  return member.status === 'creator' || member.status === 'administrator' || member.status === 'member' || (member.status === 'restricted' && member.is_member === true);
}

function toFilm(row) {
  const numericMessageId = Number(row.message_id);
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.title,
    year: Number.isInteger(row.year) ? row.year : Number(row.year) || 0,
    rating: '—',
    genre: row.genre || 'Не указан',
    duration: 'Не указана',
    description: row.description || '',
    poster: row.poster || '/favicon.svg',
    kind: row.kind === 'Сериал' ? 'Сериал' : 'Фильм',
    source: 'telegram',
    channelId: String(row.channel_id),
    messageId: Number.isSafeInteger(numericMessageId) ? numericMessageId : 0,
  };
}

function publicChannelUrl(row) {
  const messageId = parseIntegerString(row.message_id, { positive: true, safe: true });
  if (!messageId) return null;
  if (typeof row.channel_username === 'string' && TELEGRAM_USERNAME_RE.test(row.channel_username)) {
    return `https://t.me/${row.channel_username}/${messageId}`;
  }
  const channel = parseIntegerString(row.channel_id, { channel: true });
  if (!channel) return null;
  return `https://t.me/c/${channel.slice(4)}/${messageId}`;
}

function parseChannelFilm(message, updateId) {
  const content = typeof message.text === 'string' ? message.text : typeof message.caption === 'string' ? message.caption : null;
  let title = null;
  let description = '';
  if (content !== null) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const firstIndex = lines.findIndex((line) => line.trim().length > 0);
    if (firstIndex >= 0) {
      title = lines[firstIndex].trim();
      description = lines.slice(firstIndex + 1).join('\n').trim();
    }
  }
  if (!title && message.video && typeof message.video === 'object') {
    title = typeof message.video.file_name === 'string' && message.video.file_name.trim()
      ? message.video.file_name.trim()
      : `Публикация №${message.message_id}`;
  }
  if (!title) return null;
  return {
    id: crypto.randomUUID(),
    title: title.slice(0, 500),
    description: description.slice(0, SAFE_TEXT_MAX),
    channelId: String(message.chat.id),
    messageId: String(message.message_id),
    channelUsername: typeof message.chat.username === 'string' && TELEGRAM_USERNAME_RE.test(message.chat.username) ? message.chat.username : null,
    sourceDate: parseTelegramDate(message.date),
    updateId: String(updateId),
  };
}

function validateTelegramMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  if (!parseIntegerString(message.message_id, { positive: true, safe: true })) return false;
  if (!message.chat || typeof message.chat !== 'object' || !parseIntegerString(message.chat.id)) return false;
  if (!parseTelegramDate(message.date)) return false;
  return true;
}

function parseImportItem(item, configuredChannelId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new RequestError(400, 'invalid_import', 'Некорректный элемент импорта.');
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const description = typeof item.description === 'string' ? item.description : null;
  const channelId = parseIntegerString(item.channelId, { channel: true });
  const messageId = parseIntegerString(item.messageId, { positive: true, safe: true });
  if (!title || title.length > 500 || description === null || description.length > SAFE_TEXT_MAX || channelId !== configuredChannelId || !messageId) {
    throw new RequestError(400, 'invalid_import', 'Некорректный элемент импорта.');
  }
  let year = 0;
  if (item.year !== undefined) {
    if (!Number.isSafeInteger(item.year) || item.year < 0 || item.year > 9999) throw new RequestError(400, 'invalid_import', 'Некорректный год.');
    year = item.year;
  }
  const genre = item.genre === undefined ? 'Не указан' : typeof item.genre === 'string' && item.genre.trim() && item.genre.length <= 120 ? item.genre.trim() : null;
  const kind = item.kind === undefined ? 'Фильм' : item.kind;
  const poster = item.poster === undefined ? '/favicon.svg' : typeof item.poster === 'string' && item.poster.length <= 2048 && item.poster ? item.poster : null;
  if (!genre || !['Фильм', 'Сериал'].includes(kind) || !poster) throw new RequestError(400, 'invalid_import', 'Некорректные метаданные фильма.');
  return { id: crypto.randomUUID(), title, description, channelId, messageId, year, genre, kind, poster };
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function createApp({ config = readConfig(), pool = null, telegram = null } = {}) {
  const app = express();
  const telegramClient = telegram || (config.telegramConfigured ? createTelegramClient(config.telegramBotToken) : null);
  const distDirectory = path.resolve(process.cwd(), 'dist');

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops || false);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    response.vary('Origin');
    response.vary('X-Telegram-Init-Data');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.appOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }));
  // Reject unauthenticated webhook requests before spending work on their JSON body.
  // Correctly authenticated Telegram retries are not subject to this abuse limiter.
  app.use('/api/telegram/webhook', rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (request) => Boolean(config.telegramWebhookSecret && safeEqualText(request.get('X-Telegram-Bot-Api-Secret-Token') || '', config.telegramWebhookSecret)),
    handler: (_request, response) => sendError(response, 429, 'rate_limited', 'Слишком много неподтверждённых запросов webhook.'),
  }), (request, response, next) => {
    if (request.method !== 'POST') return next();
    if (!needs(response, Boolean(config.telegramConfigured && config.telegramWebhookSecret && telegramClient))) return;
    if (!safeEqualText(request.get('X-Telegram-Bot-Api-Secret-Token') || '', config.telegramWebhookSecret)) {
      return sendError(response, 401, 'invalid_webhook_secret', 'Некорректный секрет webhook.');
    }
    return next();
  });
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (request) => request.path === '/telegram/webhook',
    handler: (_request, response) => sendError(response, 429, 'rate_limited', 'Слишком много запросов. Попробуйте позже.'),
  }));
  app.post('/api/music/recognize', express.raw({
    type: (request) => Boolean(request.is('audio/*') || request.is('application/octet-stream')),
    limit: '10mb',
  }), asyncRoute(async (request, response) => {
    if (!config.audioRecognitionApiKey) {
      return sendError(response, 503, 'recognition_not_configured', 'Распознавание музыки не настроено: на сервере отсутствует API-ключ AudD.');
    }
    if (!Buffer.isBuffer(request.body) || request.body.length < 1024) {
      return sendError(response, 400, 'audio_required', 'Отправьте короткую аудиозапись размером не менее 1 КБ.');
    }
    const form = new FormData();
    form.append('api_token', config.audioRecognitionApiKey);
    form.append('return', 'apple_music,spotify');
    form.append('file', new Blob([request.body], { type: request.get('content-type') || 'audio/webm' }), 'kinovolna-sample.webm');
    let providerResponse;
    try {
      providerResponse = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
    } catch {
      return sendError(response, 502, 'recognition_unavailable', 'Сервис распознавания музыки временно недоступен.');
    }
    const payload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !payload || payload.status !== 'success') {
      return sendError(response, 502, 'recognition_failed', 'AudD не смог обработать запись. Проверьте API-ключ и формат аудио.');
    }
    if (!payload.result) return response.json({ matched: false });
    const result = payload.result;
    return response.json({
      matched: true,
      track: {
        artist: typeof result.artist === 'string' ? result.artist : null,
        title: typeof result.title === 'string' ? result.title : null,
        album: typeof result.album === 'string' ? result.album : null,
        releaseDate: typeof result.release_date === 'string' ? result.release_date : null,
        songLink: typeof result.song_link === 'string' ? result.song_link : null,
      },
    });
  }));
  app.use(express.json({ limit: '1mb', strict: true }));

  function needs(response, condition) {
    if (!condition) {
      sendError(response, 503, 'configuration_required', 'Сервис ещё не настроен.');
      return false;
    }
    return true;
  }

  function needsCatalog(response) {
    return needs(response, Boolean(pool && config.databaseConfigured && config.telegramConfigured && config.channelConfigured && telegramClient));
  }

  function authenticate(request) {
    const initData = request.get('X-Telegram-Init-Data');
    return verifyTelegramInitData(initData, config.telegramBotToken, config.telegramInitDataMaxAge);
  }

  async function requireMember(user) {
    try {
      const member = await telegramClient.getChatMember(config.telegramChannelId, user.id);
      if (!isMember(member)) throw new RequestError(403, 'channel_membership_required', 'Требуется подписка на канал.');
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(503, 'membership_check_failed', 'Не удалось проверить подписку на канал.');
    }
  }

  async function authenticateMember(request, response) {
    if (!needsCatalog(response)) return null;
    const auth = authenticate(request);
    await requireMember(auth.user);
    return auth;
  }

  async function getFilmOr404(id, executor = pool) {
    if (!UUID_RE.test(id)) throw new RequestError(404, 'film_not_found', 'Фильм не найден.');
    const result = await executor.query(`
      SELECT id, title, description, channel_id, message_id, channel_username, source_date, year, genre, kind, poster
      FROM films
      WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0 AND message_id <= 9007199254740991
    `, [id, config.telegramChannelId]);
    if (!result.rows[0]) throw new RequestError(404, 'film_not_found', 'Фильм не найден.');
    return result.rows[0];
  }

  async function withTransaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function upsertChannelFilm(client, film) {
    await client.query(`
      INSERT INTO films (id, title, description, channel_id, message_id, channel_username, source_date, last_update_id)
      VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7::timestamptz, $8::bigint)
      ON CONFLICT (channel_id, message_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        channel_username = EXCLUDED.channel_username,
        source_date = EXCLUDED.source_date,
        last_update_id = EXCLUDED.last_update_id,
        updated_at = now()
      WHERE films.last_update_id <= EXCLUDED.last_update_id
    `, [film.id, film.title, film.description, film.channelId, film.messageId, film.channelUsername, film.sourceDate, film.updateId]);
  }

  async function sendSubscriptionInstructions(message) {
    const lines = ['Для доступа подпишитесь на канал и снова откройте ссылку.'];
    if (config.telegramChannelInviteUrl) lines.push(config.telegramChannelInviteUrl);
    await telegramClient.sendMessage(message.chat.id, lines.join('\n'));
  }

  async function processStartMessage(client, message) {
    if (message.chat?.type !== 'private' || !message.from || String(message.from.id) !== String(message.chat.id) || typeof message.text !== 'string') return;
    const command = message.text.trim().match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/);
    if (!command) return;
    const name = command[1].toLowerCase();
    const payload = command[2]?.trim();
    if (name === 'help') {
      await telegramClient.sendMessage(message.chat.id, 'Команды КИНОВОЛНА:\n/start — открыть КИНОВОЛНУ\n/help — краткая инструкция\n/id — показать ваш Telegram ID\n/admin — меню администратора (только для администратора).');
      return;
    }
    if (name === 'id') {
      await telegramClient.sendMessage(message.chat.id, `Ваш Telegram ID: ${message.from.id}`);
      return;
    }
    if (name === 'admin') {
      if (!config.telegramAdminIds.has(String(message.from.id))) {
        await telegramClient.sendMessage(message.chat.id, 'У вас нет доступа к меню администратора.');
        return;
      }
      await telegramClient.sendMessage(message.chat.id, 'Панель администратора КИНОВОЛНА\n\nВыберите действие:', { reply_markup: { inline_keyboard: [
        [{ text: '🎞 Управление каталогом', callback_data: 'admin_catalog' }],
        [{ text: '📊 Статистика', callback_data: 'admin_stats' }, { text: '🔌 Состояние интеграций', callback_data: 'admin_health' }],
      ] } });
      return;
    }
    if (name !== 'start') {
      await telegramClient.sendMessage(message.chat.id, 'Неизвестная команда. Используйте /help для списка доступных команд.');
      return;
    }
    if (!payload) {
      if (config.miniAppUrl) {
        await telegramClient.sendMessage(message.chat.id, BOT_WELCOME, {
          reply_markup: { inline_keyboard: [[{ text: '🎬 Открыть КИНОВОЛНУ', web_app: { url: config.miniAppUrl } }]] },
        });
      } else await telegramClient.sendMessage(message.chat.id, `${BOT_WELCOME}\n\nMini App пока не опубликован: добавьте настоящий production URL в MINI_APP_URL.`);
      return;
    }
    const match = payload.match(/^film_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
    if (!match) return;

    if (!client || !pool || !config.databaseConfigured || !config.channelConfigured) {
      await telegramClient.sendMessage(message.chat.id, 'Каталог фильмов пока не подключён. Откройте приложение через /start без параметров.');
      return;
    }

    let member;
    try {
      member = await telegramClient.getChatMember(config.telegramChannelId, message.from.id);
    } catch {
      throw new RequestError(503, 'membership_check_failed', 'Не удалось проверить подписку на канал.');
    }
    if (!isMember(member)) {
      await sendSubscriptionInstructions(message);
      return;
    }
    const result = await client.query(`
      SELECT id, channel_id, message_id, channel_username FROM films
      WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0 AND message_id <= 9007199254740991
    `, [match[1], config.telegramChannelId]);
    const row = result.rows[0];
    if (!row) {
      await telegramClient.sendMessage(message.chat.id, 'Фильм не найден или больше недоступен.');
      return;
    }
    const url = publicChannelUrl(row);
    if (!url) throw new RequestError(500, 'link_unavailable', 'Ссылка на фильм недоступна.');
    await telegramClient.sendMessage(message.chat.id, `Откройте публикацию: ${url}`);
  }

  async function processAdminCallback(client, callback) {
    const userId = callback?.from?.id;
    const chatId = callback?.message?.chat?.id;
    if (!Number.isSafeInteger(userId) || userId <= 0 || !chatId || callback?.message?.chat?.type !== 'private') return;
    await telegramClient.call('answerCallbackQuery', { callback_query_id: callback.id });
    if (!config.telegramAdminIds.has(String(userId))) {
      await telegramClient.sendMessage(chatId, 'У вас нет доступа к меню администратора.');
      return;
    }
    if (callback.data === 'admin_catalog') {
      if (!pool || !config.databaseConfigured || !config.channelConfigured) {
        await telegramClient.sendMessage(chatId, 'Управление каталогом недоступно: база данных или Telegram-канал ещё не настроены. Реальный каталог не изменён.');
        return;
      }
      const result = await client.query('SELECT COUNT(*)::bigint AS total FROM films WHERE channel_id = $1::bigint', [config.telegramChannelId]);
      await telegramClient.sendMessage(chatId, `Каталог подключён: ${result.rows[0].total} записей.\nИзменение записей выполняется через защищённый admin API Mini App; фиктивные операции не выполняются.`);
      return;
    }
    if (callback.data === 'admin_stats') {
      if (!pool || !config.databaseConfigured || !config.channelConfigured) {
        await telegramClient.sendMessage(chatId, 'Статистика недоступна: база данных или Telegram-канал ещё не настроены. Фиктивные цифры не показываются.');
        return;
      }
      const result = await client.query('SELECT COUNT(*)::bigint AS films FROM films WHERE channel_id = $1::bigint', [config.telegramChannelId]);
      await telegramClient.sendMessage(chatId, `Статистика каталога:\nФильмов и сериалов в базе: ${result.rows[0].films}`);
      return;
    }
    if (callback.data === 'admin_health') {
      let bot = null;
      try {
        bot = await telegramClient.getMe();
      } catch {
        // Show a safe status without exposing Bot API request details.
      }
      const telegramStatus = bot?.username
        ? `Telegram Bot API: отвечает как @${bot.username}`
        : 'Telegram Bot API: не удалось проверить';
      const databaseStatus = pool && config.databaseConfigured ? 'база данных: настроена' : 'база данных: не настроена';
      let channelStatus = config.channelConfigured ? 'канал: ID настроен, доступ не проверен' : 'канал: не настроен';
      if (config.channelConfigured && bot?.id) {
        try {
          const membership = await telegramClient.getChatMember(config.telegramChannelId, bot.id);
          channelStatus = membership?.status === 'administrator' || membership?.status === 'creator'
            ? 'канал: бот — администратор'
            : 'канал: боту не выданы права администратора';
        } catch {
          channelStatus = 'канал: не удалось проверить';
        }
      }
      await telegramClient.sendMessage(chatId, `Состояние интеграций:\n${telegramStatus}\n${databaseStatus}\n${channelStatus}\nMini App URL: ${config.miniAppUrl ? 'настроен' : 'не настроен'}`);
    }
  }

  app.get('/api/health', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.get('/api/ready', asyncRoute(async (_request, response) => {
    if (!needs(response, Boolean(pool && config.databaseConfigured))) return;
    try {
      await pool.query('SELECT 1');
      response.status(200).json({ status: 'ready' });
    } catch {
      sendError(response, 503, 'database_unavailable', 'База данных недоступна.');
    }
  }));
  app.get('/api/config', (_request, response) => response.json({
    telegramConfigured: config.telegramConfigured,
    databaseConfigured: config.databaseConfigured,
    channelConfigured: config.channelConfigured,
    audioRecognitionConfigured: Boolean(config.audioRecognitionApiKey),
  }));

  app.post('/api/telegram/auth', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(config.telegramConfigured && telegramClient))) return;
    const auth = verifyTelegramInitData(request.body?.initData, config.telegramBotToken, config.telegramInitDataMaxAge);
    response.json(auth);
  }));

  app.get('/api/films', asyncRoute(async (request, response) => {
    await authenticateMember(request, response);
    if (response.headersSent) return;
    const limit = parsePagination(request.query.limit, 24, 1, 100, 'limit');
    const offset = parsePagination(request.query.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
    const q = request.query.q === undefined ? '' : typeof request.query.q === 'string' && request.query.q.length <= 200 ? request.query.q.trim() : null;
    if (q === null) throw new RequestError(400, 'invalid_search', 'Поисковый запрос некорректен.');
    const parameters = [config.telegramChannelId, q, limit, offset];
    const [films, count] = await Promise.all([
      pool.query(`
        SELECT id, title, description, channel_id, message_id, channel_username, source_date, year, genre, kind, poster
        FROM films
        WHERE channel_id = $1::bigint AND message_id > 0 AND message_id <= 9007199254740991
          AND ($2 = '' OR title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')
        ORDER BY source_date DESC NULLS LAST, created_at DESC
        LIMIT $3 OFFSET $4
      `, parameters),
      pool.query(`
        SELECT COUNT(*)::bigint AS total FROM films
        WHERE channel_id = $1::bigint AND message_id > 0 AND message_id <= 9007199254740991
          AND ($2 = '' OR title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')
      `, [config.telegramChannelId, q]),
    ]);
    response.json({
      items: films.rows.map(toFilm),
      pagination: { total: Number(count.rows[0].total), limit, offset },
    });
  }));

  app.get('/api/films/:id/telegram', asyncRoute(async (request, response) => {
    await authenticateMember(request, response);
    if (response.headersSent) return;
    const film = await getFilmOr404(request.params.id);
    if (config.telegramBotUsername) {
      return response.json({ url: `https://t.me/${config.telegramBotUsername}?start=film_${film.id}`, mode: 'bot' });
    }
    const url = publicChannelUrl(film);
    if (!url) throw new RequestError(503, 'link_unavailable', 'Ссылка на фильм пока недоступна.');
    return response.json({ url, mode: 'channel' });
  }));

  app.get('/api/films/:id/playback', asyncRoute(async (request, response) => {
    await authenticateMember(request, response);
    if (response.headersSent) return;
    await getFilmOr404(request.params.id);
    sendError(response, 503, 'video_source_not_configured', 'Источник видео пока не настроен.');
  }));

  app.get('/api/films/:id', asyncRoute(async (request, response) => {
    await authenticateMember(request, response);
    if (response.headersSent) return;
    const film = await getFilmOr404(request.params.id);
    response.json(toFilm(film));
  }));

  app.post('/api/admin/films/import', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(pool && config.databaseConfigured && config.telegramConfigured && config.channelConfigured && telegramClient && config.telegramAdminIds.size))) return;
    const auth = authenticate(request);
    if (!config.telegramAdminIds.has(String(auth.user.id))) throw new RequestError(403, 'admin_required', 'Недостаточно прав.');
    const items = request.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new RequestError(400, 'invalid_import', 'Передайте от 1 до 100 фильмов.');
    const parsedItems = items.map((item) => parseImportItem(item, config.telegramChannelId));
    await withTransaction(async (client) => {
      for (const item of parsedItems) {
        await client.query(`
          INSERT INTO films (id, title, description, channel_id, message_id, year, genre, kind, poster)
          VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7, $8, $9)
          ON CONFLICT (channel_id, message_id) DO UPDATE SET
            title = EXCLUDED.title, description = EXCLUDED.description, year = EXCLUDED.year,
            genre = EXCLUDED.genre, kind = EXCLUDED.kind, poster = EXCLUDED.poster, updated_at = now()
        `, [item.id, item.title, item.description, item.channelId, item.messageId, item.year, item.genre, item.kind, item.poster]);
      }
    });
    response.json({ imported: parsedItems.length });
  }));

  app.post('/api/telegram/webhook', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(config.telegramConfigured && config.telegramWebhookSecret && telegramClient))) return;
    if (!safeEqualText(request.get('X-Telegram-Bot-Api-Secret-Token') || '', config.telegramWebhookSecret)) {
      return sendError(response, 401, 'invalid_webhook_secret', 'Некорректный секрет webhook.');
    }
    const update = request.body;
    const updateId = parseIntegerString(update?.update_id, { positive: false });
    if (!update || typeof update !== 'object' || Array.isArray(update) || !updateId || BigInt(updateId) < 0n) {
      return sendError(response, 400, 'invalid_update', 'Некорректный Telegram update.');
    }
    for (const key of ['channel_post', 'edited_channel_post', 'message']) {
      if (update[key] !== undefined && !validateTelegramMessage(update[key])) {
        return sendError(response, 400, 'invalid_update', 'Некорректное сообщение Telegram.');
      }
    }

    const databaseAvailable = Boolean(pool && config.databaseConfigured);
    const channelMessage = update.channel_post || update.edited_channel_post;
    if (channelMessage && (!databaseAvailable || !config.channelConfigured)) {
      return sendError(response, 503, 'configuration_required', 'Для приема публикаций из канала необходимо настроить базу данных и Telegram-канал.');
    }

    const processUpdate = async (client) => {
      if (client) {
        const dedupe = await client.query('INSERT INTO telegram_updates (update_id) VALUES ($1::bigint) ON CONFLICT DO NOTHING RETURNING update_id', [updateId]);
        if (!dedupe.rows[0]) return 'duplicate';
      }

      if (channelMessage) {
        if (String(channelMessage.chat.id) !== config.telegramChannelId) return 'ignored';
        const film = parseChannelFilm(channelMessage, updateId);
        if (!film) return 'ignored';
        if (!film.sourceDate) throw new RequestError(400, 'invalid_update', 'Некорректная дата сообщения Telegram.');
        await upsertChannelFilm(client, film);
        return 'catalogued';
      }
      if (update.message) {
        await processStartMessage(client, update.message);
        return 'message';
      }
      if (update.callback_query) {
        await processAdminCallback(client, update.callback_query);
        return 'callback_query';
      }
      return 'ignored';
    };
    const outcome = databaseAvailable ? await withTransaction(processUpdate) : await processUpdate(null);
    response.status(200).json({ ok: true, status: outcome });
  }));

  if (config.nodeEnv === 'production' && fs.existsSync(path.join(distDirectory, 'index.html'))) {
    app.use(express.static(distDirectory, { index: false, fallthrough: true }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && !request.path.startsWith('/api/')) return response.sendFile(path.join(distDirectory, 'index.html'));
      return next();
    });
  }

  app.use((request, response) => sendError(response, 404, 'not_found', 'Маршрут не найден.'));
  app.use((error, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof RequestError) return sendError(response, error.status, error.code, error.message);
    if (error?.type === 'entity.parse.failed') return sendError(response, 400, 'invalid_json', 'Некорректный JSON.');
    if (error?.type === 'entity.too.large') return sendError(response, 413, 'payload_too_large', 'Размер JSON превышает допустимый лимит.');
    return sendError(response, 500, 'internal_error', 'Внутренняя ошибка сервера.');
  });

  return app;
}
