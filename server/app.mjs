import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { readConfig } from './config.mjs';
import { createTelegramClient } from './telegram.mjs';
import { getTelegramDiagnostics } from './telegram-diagnostics.mjs';
import { fetchTmdbWatchProviders, matchTmdbPoster } from './tmdb.mjs';
import { searchYoutubeMusic, YouTubeApiError } from './youtube.mjs';
import { movieCopyOptions } from './movie-caption.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TELEGRAM_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const SAFE_TEXT_MAX = 10_000;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const TELEGRAM_FILE_DOWNLOAD_LIMIT = 20 * 1024 * 1024;
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

function safeProviderText(value) {
  return String(value ?? 'unknown')
    .replace(/(api[_-]?token|authorization|bearer)[=: ]+[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 300);
}

function audioUploadDescriptor(contentType, body) {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  const has = (offset, ...bytes) => bytes.every((byte, index) => body[offset + index] === byte);
  const descriptors = {
    'audio/webm': { extension: 'webm', valid: has(0, 0x1a, 0x45, 0xdf, 0xa3) },
    'audio/mp4': { extension: 'mp4', valid: body.length > 12 && body.subarray(4, 8).toString('ascii') === 'ftyp' },
    'audio/x-m4a': { extension: 'm4a', valid: body.length > 12 && body.subarray(4, 8).toString('ascii') === 'ftyp' },
    'audio/ogg': { extension: 'ogg', valid: body.subarray(0, 4).toString('ascii') === 'OggS' },
    'audio/wav': { extension: 'wav', valid: body.length > 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WAVE' },
    'audio/mpeg': { extension: 'mp3', valid: body.subarray(0, 3).toString('ascii') === 'ID3' || (body[0] === 0xff && (body[1] & 0xe0) === 0xe0) },
  };
  const descriptor = descriptors[mime];
  if (!descriptor || !descriptor.valid || !body.some((byte) => byte !== 0)) return null;
  return { ...descriptor, mime };
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

function signVideoToken(filmId, expiresAt, secret) {
  const payload = `${filmId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyVideoToken(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !UUID_RE.test(parts[0]) || !/^\d+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return null;
  const expected = signVideoToken(parts[0], expiresAt, secret).split('.')[2];
  return safeEqualText(expected, parts[2]) ? { filmId: parts[0], expiresAt } : null;
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

function toFilm(row, posterUrl = null) {
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
    poster: posterUrl || row.poster || '/favicon.svg',
    kind: row.kind === 'Сериал' ? 'Сериал' : 'Фильм',
    source: 'telegram',
    videoAvailable: Boolean(row.video_file_id),
    videoSize: row.video_file_size ? Number(row.video_file_size) : null,
    videoMimeType: row.video_mime_type || null,
    videoDuration: Number.isInteger(row.video_duration) ? row.video_duration : Number(row.video_duration) || null,
    channelId: String(row.channel_id),
    messageId: Number.isSafeInteger(numericMessageId) ? numericMessageId : 0,
    posterSource: row.poster_source || null,
    posterSourceId: row.poster_source_id || null,
    posterConfidence: row.poster_confidence === null || row.poster_confidence === undefined ? null : Number(row.poster_confidence),
    seriesId: row.series_id || null,
    seasonNumber: row.season_number === null || row.season_number === undefined ? null : Number(row.season_number),
    episodeNumber: row.episode_number === null || row.episode_number === undefined ? null : Number(row.episode_number),
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
  const photoSizes = Array.isArray(message.photo) ? [...message.photo].reverse() : [];
  const posterFileId = typeof message.video?.thumbnail?.file_id === 'string'
    ? message.video.thumbnail.file_id
    : photoSizes.find((photo) => typeof photo?.file_id === 'string')?.file_id || null;
  return {
    id: crypto.randomUUID(),
    title: title.slice(0, 500),
    description: description.slice(0, SAFE_TEXT_MAX),
    channelId: String(message.chat.id),
    messageId: String(message.message_id),
    channelUsername: typeof message.chat.username === 'string' && TELEGRAM_USERNAME_RE.test(message.chat.username) ? message.chat.username : null,
    sourceDate: parseTelegramDate(message.date),
    updateId: String(updateId),
    videoFileId: typeof message.video?.file_id === 'string' ? message.video.file_id : null,
    videoFileSize: Number.isSafeInteger(message.video?.file_size) ? message.video.file_size : null,
    videoMimeType: typeof message.video?.mime_type === 'string' ? message.video.mime_type.slice(0, 120) : null,
    videoDuration: Number.isSafeInteger(message.video?.duration) ? message.video.duration : null,
    posterFileId,
    mediaGroupId: typeof message.media_group_id === 'string' && message.media_group_id.length <= 128 ? message.media_group_id : null,
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
  const seriesTitle = typeof item.seriesTitle === 'string' && item.seriesTitle.trim() ? item.seriesTitle.trim().slice(0, 500) : null;
  const seasonNumber = Number.isSafeInteger(item.seasonNumber) && item.seasonNumber >= 0 && item.seasonNumber <= 999 ? item.seasonNumber : null;
  const episodeNumber = Number.isSafeInteger(item.episodeNumber) && item.episodeNumber >= 1 && item.episodeNumber <= 100000 ? item.episodeNumber : null;
  if ((seasonNumber !== null) !== (episodeNumber !== null)) throw new RequestError(400, 'invalid_import', 'Mavsum va qism raqami birga berilishi kerak.');
  return { id: crypto.randomUUID(), title, description, channelId, messageId, year, genre, kind, poster, seriesTitle, seasonNumber, episodeNumber };
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
  app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
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
    const descriptor = audioUploadDescriptor(request.get('content-type'), request.body);
    if (!descriptor) {
      return sendError(response, 415, 'audio_invalid', 'Формат аудиозаписи не распознан. Используйте запись WebM, MP4, OGG, WAV или MP3.');
    }
    const form = new FormData();
    form.append('api_token', config.audioRecognitionApiKey);
    form.append('return', 'apple_music,spotify');
    form.append('file', new Blob([request.body], { type: descriptor.mime }), `kinovolna-sample.${descriptor.extension}`);
    let providerResponse;
    try {
      providerResponse = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
    } catch {
      return sendError(response, 502, 'recognition_unavailable', 'Сервис распознавания музыки временно недоступен.');
    }
    const payload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !payload || payload.status !== 'success') {
      const providerError = payload?.error ?? payload;
      const errorCode = safeProviderText(providerError?.error_code ?? providerError?.code ?? payload?.error_code ?? payload?.code ?? 'unknown');
      const errorMessage = safeProviderText(providerError?.error_message ?? providerError?.message ?? payload?.error_message ?? payload?.message ?? 'unknown');
      console.warn('[music] AudD recognition failed', { http_status: providerResponse.status, error_code: errorCode, error_message: errorMessage, mime: descriptor.mime, extension: descriptor.extension, bytes: request.body.length });
      const clientMessage = errorCode === '902' && /limit.{0,40}(reached|exceeded)|quota.{0,40}(reached|exceeded)/i.test(errorMessage)
        ? 'Лимит запросов AudD исчерпан. Проверьте квоту или тариф ключа AudD.'
        : ({
        '900': 'Ключ AudD не принят или закончился лимит бесплатных запросов.',
        '902': 'Ключ AudD недействителен. Проверьте серверную настройку API-ключа.',
        '700': 'AudD не получил корректный аудиофайл. Повторите запись ещё раз.',
        '500': 'AudD не смог прочитать аудиофайл. Попробуйте записать фрагмент в другом браузере.',
        '300': 'Фрагмент слишком короткий для распознавания. Запишите музыку не менее нескольких секунд.',
      }[errorCode] ?? 'AudD не смог обработать запись. Проверьте аудио и настройки сервиса.');
      return sendError(response, 502, 'recognition_failed', clientMessage);
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
      SELECT id, title, description, channel_id, message_id, channel_username, source_date, year, genre, kind, poster, poster_source, poster_source_id, poster_confidence, series_id, season_number, episode_number, poster_file_id, video_file_id, video_file_size, video_mime_type, video_duration
      FROM films
      WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0 AND message_id <= 9007199254740991
    `, [id, config.telegramChannelId]);
    if (!result.rows[0]) throw new RequestError(404, 'film_not_found', 'Фильм не найден.');
    return result.rows[0];
  }

  function posterProxyUrl(film) {
    if (!film.poster_file_id || !config.telegramBotToken) return null;
    const base = (config.publicBaseUrl || config.appOrigins[0] || '').replace(/\/+$/, '');
    if (!base) return null;
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const token = signVideoToken(film.id, expiresAt, config.telegramBotToken);
    return `${base}/api/films/${film.id}/poster?token=${encodeURIComponent(token)}`;
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
    if (film.mediaGroupId) {
      await client.query(`
        INSERT INTO films (id, title, description, channel_id, message_id, channel_username, source_date, last_update_id, video_file_id, video_file_size, video_mime_type, video_duration, poster_file_id, media_group_id)
        VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7::timestamptz, $8::bigint, $9, $10::bigint, $11, $12, $13, $14)
        ON CONFLICT (channel_id, media_group_id) WHERE media_group_id IS NOT NULL DO UPDATE SET
          title = CASE WHEN EXCLUDED.title LIKE 'Публикация №%' AND films.title NOT LIKE 'Публикация №%' THEN films.title ELSE EXCLUDED.title END,
          description = CASE WHEN EXCLUDED.title LIKE 'Публикация №%' AND films.title NOT LIKE 'Публикация №%' THEN films.description ELSE EXCLUDED.description END,
          channel_username = COALESCE(EXCLUDED.channel_username, films.channel_username),
          source_date = COALESCE(EXCLUDED.source_date, films.source_date),
          message_id = CASE WHEN EXCLUDED.video_file_id IS NOT NULL OR films.video_file_id IS NULL THEN EXCLUDED.message_id ELSE films.message_id END,
          video_file_id = COALESCE(EXCLUDED.video_file_id, films.video_file_id),
          video_file_size = COALESCE(EXCLUDED.video_file_size, films.video_file_size),
          video_mime_type = COALESCE(EXCLUDED.video_mime_type, films.video_mime_type),
          video_duration = COALESCE(EXCLUDED.video_duration, films.video_duration),
          poster_file_id = COALESCE(EXCLUDED.poster_file_id, films.poster_file_id),
          last_update_id = EXCLUDED.last_update_id,
          updated_at = now()
        WHERE films.last_update_id <= EXCLUDED.last_update_id
      `, [film.id, film.title, film.description, film.channelId, film.messageId, film.channelUsername, film.sourceDate, film.updateId, film.videoFileId, film.videoFileSize, film.videoMimeType, film.videoDuration, film.posterFileId, film.mediaGroupId]);
      return;
    }
    await client.query(`
      INSERT INTO films (id, title, description, channel_id, message_id, channel_username, source_date, last_update_id, video_file_id, video_file_size, video_mime_type, video_duration, poster_file_id, media_group_id)
      VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7::timestamptz, $8::bigint, $9, $10::bigint, $11, $12, $13, $14)
      ON CONFLICT (channel_id, message_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        channel_username = EXCLUDED.channel_username,
        source_date = EXCLUDED.source_date,
        video_file_id = COALESCE(EXCLUDED.video_file_id, films.video_file_id),
        video_file_size = COALESCE(EXCLUDED.video_file_size, films.video_file_size),
        video_mime_type = COALESCE(EXCLUDED.video_mime_type, films.video_mime_type),
        video_duration = COALESCE(EXCLUDED.video_duration, films.video_duration),
        poster_file_id = COALESCE(EXCLUDED.poster_file_id, films.poster_file_id),
        last_update_id = EXCLUDED.last_update_id,
        updated_at = now()
      WHERE films.last_update_id <= EXCLUDED.last_update_id
    `, [film.id, film.title, film.description, film.channelId, film.messageId, film.channelUsername, film.sourceDate, film.updateId, film.videoFileId, film.videoFileSize, film.videoMimeType, film.videoDuration, film.posterFileId, null]);
  }

  async function sendSubscriptionInstructions(message) {
    const keyboard = [];
    if (config.telegramChannelInviteUrl) keyboard.push([{ text: 'Открыть канал', url: config.telegramChannelInviteUrl }]);
    keyboard.push([{ text: 'Я подписался — проверить', callback_data: 'membership_recheck' }]);
    await telegramClient.sendMessage(message.chat.id, 'Для доступа подпишитесь на канал, затем нажмите кнопку проверки подписки.', {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  async function sendFilmToPrivateChat(client, chatId, film) {
    // Imported historical rows may not have a file_id, but copyMessage can still
    // copy the original channel message by chat_id + message_id. Playback remains
    // disabled until a real video_file_id is indexed.
    if (film.message_id && film.channel_id) {
      try {
        const options = movieCopyOptions(film.title);
        if (client && !film.series_id) {
          const metadata = await client.query('SELECT series_id, season_number, episode_number FROM films WHERE id = $1', [film.id]);
          Object.assign(film, metadata.rows[0] || {});
        }
        if (client && film.series_id) {
          const siblings = await client.query(`SELECT f.id, f.title, f.channel_id, f.message_id, f.season_number, f.episode_number
            FROM films f WHERE f.series_id = $1 AND f.message_id > 0 ORDER BY f.season_number NULLS LAST, f.episode_number NULLS LAST, f.title`, [film.series_id]);
          const index = siblings.rows.findIndex((item) => item.id === film.id);
          const previous = index > 0 ? siblings.rows[index - 1] : null;
          const next = index >= 0 && index < siblings.rows.length - 1 ? siblings.rows[index + 1] : null;
          const row = [];
          if (previous) row.push({ text: '⬅️ Oldingi qism', callback_data: `episode_${previous.id}` });
          if (next) row.push({ text: '➡️ Keyingi qism', callback_data: `episode_${next.id}` });
          if (siblings.rows.length > 1) options.reply_markup = { inline_keyboard: [...(row.length ? [row] : []), [{ text: '📋 Qismlar ro‘yxati', callback_data: `episode_list_${film.series_id}` }]] };
        }
        await telegramClient.copyMessage(chatId, film.channel_id, film.message_id, options);
        return;
      } catch {
        await telegramClient.sendMessage(chatId, 'Не удалось отправить видео из канала. Попробуйте открыть публикацию через Mini App.');
        return;
      }
    }
    const url = publicChannelUrl(film);
    await telegramClient.sendMessage(chatId, url ? `Нашёл публикацию, но в каталоге пока нет видеофайла: ${url}` : 'У этой публикации пока нет доступного видеофайла.');
  }

  async function requireBotChatMember(message) {
    let member;
    try {
      member = await telegramClient.getChatMember(config.telegramChannelId, message.from.id);
    } catch {
      throw new RequestError(503, 'membership_check_failed', 'Не удалось проверить подписку на канал.');
    }
    if (!isMember(member)) {
      await sendSubscriptionInstructions(message);
      return false;
    }
    return true;
  }

  async function searchFilmsForBot(client, message, rawQuery) {
    const chatId = message.chat.id;
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 120) {
      await telegramClient.sendMessage(chatId, 'Введите название фильма длиной от 2 до 120 символов.');
      return;
    }
    if (!client || !pool || !config.databaseConfigured || !config.channelConfigured || !telegramClient) {
      await telegramClient.sendMessage(chatId, 'Каталог фильмов пока не подключён. Попробуйте позже.');
      return;
    }
    if (!await requireBotChatMember(message)) return;
    const result = await client.query(`
      SELECT id, title, year, kind, channel_id, message_id, channel_username, video_file_id
      FROM films
      WHERE channel_id = $1::bigint AND message_id > 0 AND message_id <= 9007199254740991
        AND position(lower($2) in lower(title)) > 0
      ORDER BY (lower(title) = lower($2)) DESC, title ASC
      LIMIT 9
    `, [config.telegramChannelId, query]);
    const films = result.rows;
    if (!films.length) {
      await telegramClient.sendMessage(chatId, 'Кино не найдено, проверьте название.');
      return;
    }
    if (films.length === 1) {
      await sendFilmToPrivateChat(client, chatId, films[0]);
      return;
    }
    const visibleFilms = films.slice(0, 8);
    const buttons = visibleFilms.map((film) => {
      const suffix = film.year ? ` (${film.year})` : '';
      const title = Array.from(String(film.title)).slice(0, 56).join('');
      return [{ text: `${title}${suffix}`.slice(0, 64), callback_data: `filmselect_${film.id}` }];
    });
    await telegramClient.sendMessage(chatId, `Нашёл несколько вариантов по запросу «${query}». Выберите нужный фильм:`, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async function processFilmSelection(client, callback) {
    const userId = callback?.from?.id;
    const chatId = callback?.message?.chat?.id;
    const match = typeof callback?.data === 'string' ? callback.data.match(/^filmselect_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i) : null;
    if (!Number.isSafeInteger(userId) || userId <= 0 || String(chatId) !== String(userId) || callback?.message?.chat?.type !== 'private' || !match) return;
    await telegramClient.call('answerCallbackQuery', { callback_query_id: callback.id });
    if (!client || !pool || !config.databaseConfigured || !config.channelConfigured) {
      await telegramClient.sendMessage(chatId, 'Каталог фильмов пока не подключён. Попробуйте позже.');
      return;
    }
    const message = { chat: callback.message.chat, from: callback.from };
    if (!await requireBotChatMember(message)) return;
    const result = await client.query(`
      SELECT id, title, year, kind, channel_id, message_id, channel_username, video_file_id
      FROM films
      WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0 AND message_id <= 9007199254740991
    `, [match[1], config.telegramChannelId]);
    if (!result.rows[0]) {
      await telegramClient.sendMessage(chatId, 'Фильм не найден или больше недоступен.');
      return;
    }
    await sendFilmToPrivateChat(client, chatId, result.rows[0]);
  }

  async function processEpisodeCallback(client, callback) {
    const userId = callback?.from?.id;
    const chatId = callback?.message?.chat?.id;
    const data = typeof callback?.data === 'string' ? callback.data : '';
    const episodeMatch = data.match(/^episode_([0-9a-f-]{36})$/i);
    const listMatch = data.match(/^episode_list_([0-9a-f-]{36})$/i);
    if (!Number.isSafeInteger(userId) || userId <= 0 || String(chatId) !== String(userId) || callback?.message?.chat?.type !== 'private' || (!episodeMatch && !listMatch)) return;
    await telegramClient.call('answerCallbackQuery', { callback_query_id: callback.id });
    if (!client || !pool || !config.databaseConfigured || !config.channelConfigured || !await requireBotChatMember({ chat: callback.message.chat, from: callback.from })) return;
    if (listMatch) {
      const rows = await client.query(`SELECT f.id, f.title, f.season_number, f.episode_number FROM films f WHERE f.series_id = $1 ORDER BY f.season_number, f.episode_number`, [listMatch[1]]);
      if (!rows.rows.length) return telegramClient.sendMessage(chatId, 'Qismlar ro‘yxati topilmadi.');
      return telegramClient.sendMessage(chatId, '📋 Qismlar ro‘yxati:', { reply_markup: { inline_keyboard: rows.rows.slice(0, 50).map((row) => [{ text: `${row.season_number ? `S${row.season_number} ` : ''}${row.episode_number ? `E${row.episode_number} ` : ''}${String(row.title).slice(0, 45)}`, callback_data: `episode_${row.id}` }]) } });
    }
    const result = await client.query(`SELECT id, title, channel_id, message_id, channel_username, video_file_id, series_id, season_number, episode_number FROM films WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0`, [episodeMatch[1], config.telegramChannelId]);
    if (!result.rows[0]) return telegramClient.sendMessage(chatId, 'Bu qism topilmadi yoki mavjud emas.');
    await sendFilmToPrivateChat(client, chatId, result.rows[0]);
  }

  async function processMembershipRecheck(callback) {
    const userId = callback?.from?.id;
    const chatId = callback?.message?.chat?.id;
    if (!Number.isSafeInteger(userId) || userId <= 0 || String(chatId) !== String(userId) || callback?.message?.chat?.type !== 'private') return;
    await telegramClient.call('answerCallbackQuery', { callback_query_id: callback.id });
    let member;
    try {
      member = await telegramClient.getChatMember(config.telegramChannelId, userId);
    } catch {
      await telegramClient.sendMessage(chatId, 'Не удалось проверить подписку на канал. Попробуйте ещё раз позже.');
      return;
    }
    if (isMember(member)) {
      await telegramClient.sendMessage(chatId, 'Подписка подтверждена. Отправьте название фильма или снова откройте ссылку на фильм.');
      return;
    }
    await sendSubscriptionInstructions({ chat: callback.message.chat, from: callback.from });
  }

  async function processStartMessage(client, message) {
    if (message.chat?.type !== 'private' || !message.from || String(message.from.id) !== String(message.chat.id) || typeof message.text !== 'string') return;
    const command = message.text.trim().match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/);
    if (!command) {
      const query = message.text.trim();
      if (query && !query.startsWith('/')) await searchFilmsForBot(client, message, query);
      return;
    }
    const name = command[1].toLowerCase();
    const payload = command[2]?.trim();
    if (name === 'help') {
      await telegramClient.sendMessage(message.chat.id, 'Команды КИНОВОЛНА:\n/start — открыть КИНОВОЛНУ\nОтправьте название фильма, чтобы найти его и получить видео\n/help — краткая инструкция\n/id — показать ваш Telegram ID\n/admin — меню администратора (только для администратора).');
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
      SELECT id, title, channel_id, message_id, channel_username, video_file_id FROM films
      WHERE id = $1 AND channel_id = $2::bigint AND message_id > 0 AND message_id <= 9007199254740991
    `, [match[1], config.telegramChannelId]);
    const row = result.rows[0];
    if (!row) {
      await telegramClient.sendMessage(message.chat.id, 'Фильм не найден или больше недоступен.');
      return;
    }
    await sendFilmToPrivateChat(client, message.chat.id, row);
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
    tmdbConfigured: config.tmdbConfigured,
    youtubeConfigured: Boolean(config.youtubeDataApiKey),
  }));

  app.get('/api/admin/telegram/diagnostics', asyncRoute(async (request, response) => {
    const auth = authenticate(request);
    if (!config.telegramAdminIds.has(String(auth.user.id))) {
      throw new RequestError(403, 'admin_required', 'Недостаточно прав.');
    }
    response.json(await getTelegramDiagnostics(config, telegramClient));
  }));

  app.post('/api/telegram/auth', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(config.telegramConfigured && telegramClient))) return;
    const auth = verifyTelegramInitData(request.body?.initData, config.telegramBotToken, config.telegramInitDataMaxAge);
    response.json(auth);
  }));

  app.get('/api/catalog', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(pool && config.databaseConfigured && config.tmdbConfigured))) return;
    const limit = parsePagination(request.query.limit, 24, 1, 100, 'limit');
    const offset = parsePagination(request.query.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
    const q = request.query.q === undefined ? '' : typeof request.query.q === 'string' && request.query.q.length <= 200 ? request.query.q.trim() : null;
    if (q === null) throw new RequestError(400, 'invalid_search', 'Поисковый запрос некорректен.');
    const category = request.query.category === undefined ? 'popular' : request.query.category;
    if (!['popular', 'new', 'series'].includes(category)) throw new RequestError(400, 'invalid_category', 'Категория каталога некорректна.');
    const kindClause = category === 'series' ? "AND media_type = 'tv'" : category === 'new' ? "AND media_type = 'movie'" : '';
    const orderClause = category === 'new' ? 'year DESC, rating DESC' : 'rating DESC, year DESC';
    const values = [q, limit, offset];
    const where = `WHERE ($1 = '' OR title ILIKE '%' || $1 || '%' OR original_title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%') ${kindClause} AND poster IS NOT NULL`;
    const dedup = `FROM (
      SELECT tmdb_catalog.*, ROW_NUMBER() OVER (
        PARTITION BY lower(regexp_replace(title, '[^[:alnum:]]+', '', 'g'))
        ORDER BY rating DESC, year DESC, CASE WHEN media_type = 'movie' THEN 0 ELSE 1 END, tmdb_id
      ) AS title_rank
      FROM tmdb_catalog
      ${where}
    ) AS unique_titles
    WHERE title_rank = 1`;
    const [items, count] = await Promise.all([
      pool.query(`SELECT tmdb_id, media_type, title, original_title, description, year, rating, genre, poster ${dedup} ORDER BY ${orderClause} LIMIT $2 OFFSET $3`, values),
      pool.query(`SELECT COUNT(*)::bigint AS total ${dedup}`, [q]),
    ]);
    if (!Number(count.rows[0].total) && !q) throw new RequestError(503, 'catalog_not_synced', 'Каталог TMDB ещё не синхронизирован.');
    response.json({
      items: items.rows.map((row) => ({
        id: `tmdb-${row.media_type}-${row.tmdb_id}`,
        title: row.title,
        originalTitle: row.original_title || row.title,
        year: Number(row.year) || 0,
        rating: Number(row.rating || 0).toFixed(1),
        genre: row.genre || 'Не указан',
        duration: '—',
        description: row.description || 'Описание отсутствует в TMDB.',
        poster: row.poster || '/favicon.svg',
        kind: row.media_type === 'tv' ? 'Сериал' : 'Фильм',
        source: 'tmdb',
      })),
      pagination: { total: Number(count.rows[0].total), limit, offset },
      provider: 'TMDB',
      category,
    });
  }));

  app.get('/api/catalog/:id/watch-providers', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(config.tmdbConfigured && config.tmdbApiKey))) return;
    const match = /^tmdb-(movie|tv)-([1-9]\d{0,8})$/.exec(request.params.id);
    if (!match) throw new RequestError(400, 'invalid_tmdb_id', 'Некорректный идентификатор фильма.');
    const region = request.query.region === undefined
      ? 'UZ'
      : typeof request.query.region === 'string' ? request.query.region.toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(region)) throw new RequestError(400, 'invalid_region', 'Укажите двухбуквенный код страны.');

    let payload;
    try {
      payload = await fetchTmdbWatchProviders(config.tmdbApiKey, match[1], Number(match[2]));
    } catch {
      return sendError(response, 502, 'watch_providers_unavailable', 'Не удалось загрузить список легальных площадок.');
    }

    const country = payload?.results?.[region];
    const providerGroups = [['flatrate', 'subscription'], ['free', 'free'], ['ads', 'ads'], ['rent', 'rent'], ['buy', 'purchase']];
    const providers = [];
    for (const [source, category] of providerGroups) {
      for (const item of Array.isArray(country?.[source]) ? country[source] : []) {
        if (typeof item?.provider_name === 'string' && item.provider_name.trim()) {
          providers.push({ name: item.provider_name.trim().slice(0, 120), category });
        }
      }
    }

    let link = null;
    if (typeof country?.link === 'string') {
      try {
        const url = new URL(country.link);
        if (url.protocol === 'https:' && url.hostname === 'www.themoviedb.org' && /\/watch(?:\/|$)/.test(url.pathname)) link = url.href;
      } catch { /* Ignore malformed upstream links. */ }
    }
    response.json({ provider: 'TMDB / JustWatch', region, link, providers, attribution: 'Данные о доступности предоставлены JustWatch.' });
  }));

  app.get('/api/music/catalog', asyncRoute(async (request, response) => {
    const query = request.query.q === undefined ? '' : typeof request.query.q === 'string' && request.query.q.length <= 120 ? request.query.q.trim() : null;
    if (query === null) throw new RequestError(400, 'invalid_search', 'Поисковый запрос музыки некорректен.');
    const url = new URL(query ? 'https://api.deezer.com/search' : 'https://api.deezer.com/chart/0/tracks');
    url.searchParams.set('limit', '30');
    if (query) url.searchParams.set('q', query);
    let providerResponse;
    try {
      providerResponse = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    } catch {
      return sendError(response, 502, 'music_catalog_unavailable', 'Музыкальный каталог временно недоступен.');
    }
    const payload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !payload || !Array.isArray(payload.data)) return sendError(response, 502, 'music_catalog_unavailable', 'Музыкальный каталог не вернул данные.');
    const items = payload.data.filter((item) => typeof item.preview === 'string' && /^https:\/\//.test(item.preview) && typeof item.title === 'string' && typeof item.artist?.name === 'string').map((item, index) => ({
      id: `deezer-${item.id}`,
      title: item.title,
      artist: item.artist.name,
      album: item.album?.title || 'Deezer',
      duration: `${Math.floor(Number(item.duration || 0) / 60)}:${String(Number(item.duration || 0) % 60).padStart(2, '0')}`,
      coverStyle: ['cover-moon', 'cover-blue', 'cover-dusk', 'cover-green'][index % 4],
      tone: 'Deezer preview',
      moods: ['happy', 'road'],
      audioUrl: item.preview,
      sourceUrl: typeof item.link === 'string' ? item.link : 'https://www.deezer.com/',
      source: 'deezer',
    }));
    response.json({ provider: 'Deezer', previewSeconds: 30, items });
  }));

  app.get('/api/music/youtube', asyncRoute(async (request, response) => {
    if (!config.youtubeDataApiKey) return sendError(response, 503, 'youtube_not_configured', 'Для поиска музыки добавьте YOUTUBE_API_KEY в переменные окружения Render.');
    const query = request.query.q === undefined
      ? ''
      : typeof request.query.q === 'string' && request.query.q.length <= 120 ? request.query.q.trim() : null;
    if (query === null || !query) throw new RequestError(400, 'invalid_search', 'Введите название песни или исполнителя.');
    try {
      const items = await searchYoutubeMusic(query, config.youtubeDataApiKey, { region: 'UZ' });
      response.json({ provider: 'YouTube', region: 'UZ', items });
    } catch (error) {
      if (error instanceof YouTubeApiError) {
        const status = error.code === 'youtube_quota_exceeded' ? 429 : error.code === 'youtube_access_denied' ? 503 : 502;
        const message = error.code === 'youtube_quota_exceeded'
          ? 'Дневной лимит поиска YouTube исчерпан. Попробуйте завтра.'
          : error.code === 'youtube_access_denied'
            ? 'YouTube Data API отклонил запрос. Проверьте ключ и доступ API.'
            : 'Поиск YouTube временно недоступен. Попробуйте ещё раз.';
        return sendError(response, status, error.code, message);
      }
      return sendError(response, 502, 'youtube_search_unavailable', 'Поиск YouTube временно недоступен. Попробуйте ещё раз.');
    }
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
        SELECT id, title, description, channel_id, message_id, channel_username, source_date, year, genre, kind, poster, poster_source, poster_source_id, poster_confidence, series_id, season_number, episode_number, poster_file_id, video_file_id, video_file_size, video_mime_type, video_duration
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
      items: films.rows.map((film) => toFilm(film, posterProxyUrl(film))),
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
    const film = await getFilmOr404(request.params.id);
    if (!film.video_file_id) return sendError(response, 503, 'video_source_not_configured', 'У этой публикации нет доступного видеофайла.');
    const size = film.video_file_size ? Number(film.video_file_size) : null;
    if (size && size > TELEGRAM_FILE_DOWNLOAD_LIMIT) {
      return sendError(response, 413, 'video_too_large', 'Telegram Bot API не позволяет безопасно отдавать этот файл в веб-плеер: размер превышает 20 МБ. Используйте кнопку «Отправить в бот».');
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const token = signVideoToken(film.id, expiresAt, config.telegramBotToken);
    const base = (config.publicBaseUrl || config.appOrigins[0] || '').replace(/\/+$/, '');
    if (!base) return sendError(response, 503, 'video_source_not_configured', 'Публичный HTTPS-адрес сервера не настроен.');
    response.json({ url: `${base}/api/films/${film.id}/stream?token=${encodeURIComponent(token)}`, expiresAt, mimeType: film.video_mime_type || 'video/mp4' });
  }));

  app.get('/api/films/:id/stream', asyncRoute(async (request, response) => {
    const verified = verifyVideoToken(request.query.token, config.telegramBotToken);
    if (!verified || verified.filmId !== request.params.id) return sendError(response, 401, 'invalid_video_token', 'Ссылка на видео истекла. Откройте фильм заново.');
    const film = await getFilmOr404(request.params.id);
    if (!film.video_file_id) return sendError(response, 404, 'video_not_found', 'Видео не найдено.');
    const size = film.video_file_size ? Number(film.video_file_size) : null;
    if (size && size > TELEGRAM_FILE_DOWNLOAD_LIMIT) return sendError(response, 413, 'video_too_large', 'Видео слишком большое для веб-просмотра через Telegram Bot API.');
    let file;
    try {
      file = await telegramClient.getFile(film.video_file_id);
    } catch {
      return sendError(response, 502, 'telegram_file_unavailable', 'Telegram не вернул видеофайл. Используйте кнопку «Отправить в бот».');
    }
    if (!file?.file_path) return sendError(response, 502, 'telegram_file_unavailable', 'Путь к видеофайлу недоступен.');
    const upstreamUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
    const headers = {};
    if (typeof request.get('range') === 'string' && /^bytes=\d*-\d*$/.test(request.get('range'))) headers.Range = request.get('range');
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(30_000) });
    } catch {
      return sendError(response, 502, 'telegram_file_unavailable', 'Не удалось получить видео из Telegram.');
    }
    response.status(upstream.status);
    response.set('Content-Type', film.video_mime_type || upstream.headers.get('content-type') || 'video/mp4');
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) response.set(header, value);
    }
    if (!upstream.body) return response.end();
    for await (const chunk of upstream.body) response.write(chunk);
    response.end();
  }));

  app.get('/api/films/:id/poster', asyncRoute(async (request, response) => {
    if (!config.telegramBotToken) return sendError(response, 503, 'poster_source_not_configured', 'Telegram poster source is not configured.');
    const verified = verifyVideoToken(request.query.token, config.telegramBotToken);
    if (!verified || verified.filmId !== request.params.id) return sendError(response, 401, 'invalid_poster_token', 'Ссылка на афишу истекла. Откройте фильм заново.');
    const film = await getFilmOr404(request.params.id);
    if (!film.poster_file_id) return sendError(response, 404, 'poster_not_found', 'Афиша для этого фильма не найдена.');
    let file;
    try {
      file = await telegramClient.getFile(film.poster_file_id);
    } catch {
      return sendError(response, 502, 'telegram_poster_unavailable', 'Не удалось получить афишу из Telegram.');
    }
    if (!file?.file_path) return sendError(response, 502, 'telegram_poster_unavailable', 'Путь к афише недоступен.');
    let upstream;
    try {
      upstream = await fetch(`https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`, { signal: AbortSignal.timeout(20_000) });
    } catch {
      return sendError(response, 502, 'telegram_poster_unavailable', 'Не удалось загрузить афишу из Telegram.');
    }
    if (!upstream.ok || !upstream.body) return sendError(response, 502, 'telegram_poster_unavailable', 'Telegram не вернул изображение афиши.');
    const upstreamType = upstream.headers.get('content-type') || '';
    response.status(200);
    response.set('Content-Type', /^image\/(jpeg|png|webp|gif)$/i.test(upstreamType) ? upstreamType : 'image/jpeg');
    response.set('X-Content-Type-Options', 'nosniff');
    const size = upstream.headers.get('content-length');
    if (size && /^\d+$/.test(size)) response.set('Content-Length', size);
    for await (const chunk of upstream.body) response.write(chunk);
    response.end();
  }));

  app.get('/api/films/:id', asyncRoute(async (request, response) => {
    await authenticateMember(request, response);
    if (response.headersSent) return;
    const film = await getFilmOr404(request.params.id);
    const episodes = film.series_id
      ? await pool.query(`SELECT e.id, e.episode_number, e.title, s.season_number, f.id AS film_id, f.title AS film_title, f.video_file_id
          FROM episodes e JOIN seasons s ON s.id = e.season_id JOIN films f ON f.id = e.film_id
          WHERE s.series_id = $1 ORDER BY s.season_number, e.episode_number`, [film.series_id])
      : { rows: [] };
    response.json({ ...toFilm(film, posterProxyUrl(film)), episodes: episodes.rows.map((episode) => ({
      id: episode.film_id, title: episode.title || episode.film_title, season: Number(episode.season_number), number: Number(episode.episode_number), available: Boolean(episode.video_file_id),
    })) });
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
          INSERT INTO films (id, title, description, channel_id, message_id, year, genre, kind, poster, season_number, episode_number)
          VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (channel_id, message_id) DO UPDATE SET
            title = EXCLUDED.title, description = EXCLUDED.description, year = EXCLUDED.year,
            genre = EXCLUDED.genre, kind = EXCLUDED.kind, poster = CASE WHEN films.poster_source IS NULL THEN EXCLUDED.poster ELSE films.poster END,
            season_number = EXCLUDED.season_number, episode_number = EXCLUDED.episode_number, updated_at = now()
        `, [item.id, item.title, item.description, item.channelId, item.messageId, item.year, item.genre, item.kind, item.poster, item.seasonNumber, item.episodeNumber]);
        if (item.seriesTitle && item.seasonNumber !== null) {
          const normalized = item.seriesTitle.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
          const series = await client.query(`INSERT INTO series (id, title, normalized_title, year, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (normalized_title) DO UPDATE SET updated_at = now() RETURNING id`, [crypto.randomUUID(), item.seriesTitle, normalized, item.year, item.description]);
          const seriesId = series.rows[0].id;
          const season = await client.query(`INSERT INTO seasons (id, series_id, season_number, title) VALUES ($1, $2, $3, $4) ON CONFLICT (series_id, season_number) DO UPDATE SET title = EXCLUDED.title RETURNING id`, [crypto.randomUUID(), seriesId, item.seasonNumber, `Season ${item.seasonNumber}`]);
          await client.query('UPDATE films SET series_id = $1 WHERE channel_id = $2::bigint AND message_id = $3::bigint', [seriesId, item.channelId, item.messageId]);
          await client.query(`INSERT INTO episodes (id, season_id, film_id, episode_number, title) SELECT $1, $2, f.id, $3, f.title FROM films f WHERE f.channel_id = $4::bigint AND f.message_id = $5::bigint ON CONFLICT (film_id) DO UPDATE SET season_id = EXCLUDED.season_id, episode_number = EXCLUDED.episode_number, title = EXCLUDED.title`, [crypto.randomUUID(), season.rows[0].id, item.episodeNumber, item.channelId, item.messageId]);
        }
      }
    });
    response.json({ imported: parsedItems.length });
  }));

  app.post('/api/admin/posters/sync', asyncRoute(async (request, response) => {
    if (!needs(response, Boolean(pool && config.databaseConfigured && config.telegramConfigured && config.channelConfigured && config.tmdbApiKey))) return;
    const auth = authenticate(request);
    if (!config.telegramAdminIds.has(String(auth.user.id))) throw new RequestError(403, 'admin_required', 'Недостаточно прав.');
    const limit = Math.min(100, Math.max(1, Number(request.body?.limit || 25)));
    const result = await pool.query(`SELECT id, title, year, kind FROM films WHERE channel_id = $1::bigint AND (poster_source IS NULL OR poster_source <> 'tmdb') ORDER BY created_at LIMIT $2`, [config.telegramChannelId, limit]);
    const report = { checked: result.rows.length, matched: 0, unmatched: [], errors: [] };
    for (const film of result.rows) {
      try {
        const match = await matchTmdbPoster(config.tmdbApiKey, film.title, Number(film.year) || 0, film.kind);
        if (!match) { report.unmatched.push({ id: film.id, title: film.title, year: Number(film.year) || 0 }); continue; }
        await pool.query(`UPDATE films SET poster = $1, poster_source = 'tmdb', poster_source_id = $2, poster_confidence = $3, poster_checked_at = now(), updated_at = now() WHERE id = $4 AND channel_id = $5::bigint`, [match.poster, `${match.mediaType}:${match.tmdbId}`, match.confidence, film.id, config.telegramChannelId]);
        report.matched += 1;
      } catch (error) {
        report.errors.push({ id: film.id, title: film.title, message: String(error?.message || 'TMDB error').slice(0, 160) });
      }
    }
    response.json(report);
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
    const directChannelMessage = update.channel_post || update.edited_channel_post;
    const forwardedMessage = update.message && update.message.chat?.type === 'private' && update.message.from && config.telegramAdminIds.has(String(update.message.from.id)) && update.message.forward_from_chat && String(update.message.forward_from_chat.id) === config.telegramChannelId && update.message.forward_from_message_id
      ? { ...update.message, chat: update.message.forward_from_chat, message_id: update.message.forward_from_message_id, date: update.message.forward_date || update.message.date }
      : null;
    const channelMessage = directChannelMessage || forwardedMessage;
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
      if (update.message && !forwardedMessage) {
        await processStartMessage(client, update.message);
        return 'message';
      }
      if (update.callback_query) {
        if (typeof update.callback_query.data === 'string' && update.callback_query.data.startsWith('filmselect_')) {
          await processFilmSelection(client, update.callback_query);
        } else if (typeof update.callback_query.data === 'string' && update.callback_query.data.startsWith('episode_')) {
          await processEpisodeCallback(client, update.callback_query);
        } else if (update.callback_query.data === 'membership_recheck') {
          await processMembershipRecheck(update.callback_query);
        } else {
          await processAdminCallback(client, update.callback_query);
        }
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
