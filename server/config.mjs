import { URL } from 'node:url';

const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const CHANNEL_ID_RE = /^-100\d+$/;
const POSITIVE_ID_RE = /^[1-9]\d*$/;
const WEBHOOK_SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validHttpsUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function parseOrigins(value) {
  if (!value) return [];
  const origins = [];
  for (const part of value.split(',')) {
    try {
      const parsed = new URL(part.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) continue;
      const origin = parsed.origin;
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      // A malformed origin is deliberately not put on the allowlist.
    }
  }
  return origins;
}

function parsePositiveIds(value) {
  const ids = new Set();
  if (!value) return ids;
  for (const raw of value.split(',')) {
    const id = raw.trim();
    if (POSITIVE_ID_RE.test(id) && BigInt(id) <= MAX_SAFE_INTEGER_BIGINT) ids.add(id);
  }
  return ids;
}

function isSignedBigInt(value) {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return false;
  try {
    const parsed = BigInt(value);
    return parsed >= -MAX_SIGNED_BIGINT - 1n && parsed <= MAX_SIGNED_BIGINT;
  } catch {
    return false;
  }
}

function parseMaxAge(value) {
  if (value === undefined || value === '') return 3600;
  if (!/^\d+$/.test(value)) return 3600;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 86_400 ? parsed : 3600;
}

function validDatabaseUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['postgres:', 'postgresql:'].includes(parsed.protocol) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Reads only server-side settings. Invalid optional values are treated as absent,
 * which keeps a server live but prevents protected endpoints from operating.
 */
export function readConfig(env = process.env) {
  const botToken = nonEmpty(env.TELEGRAM_BOT_TOKEN);
  const usernameCandidate = nonEmpty(env.TELEGRAM_BOT_USERNAME);
  const channelCandidate = nonEmpty(env.TELEGRAM_CHANNEL_ID);
  const channelInviteCandidate = nonEmpty(env.TELEGRAM_CHANNEL_INVITE_URL);
  const portCandidate = Number(env.PORT ?? 3001);
  const proxyHopsCandidate = Number(env.TRUST_PROXY_HOPS ?? 0);

  const channelInviteUrl = validHttpsUrl(channelInviteCandidate);
  const inviteIsTelegram = channelInviteUrl && /^https:\/\/t\.me\/(?:\+[^/?#]+|joinchat\/[^/?#]+)\/?$/.test(channelInviteUrl);

  return Object.freeze({
    nodeEnv: env.NODE_ENV === 'production' ? 'production' : 'development',
    port: Number.isSafeInteger(portCandidate) && portCandidate > 0 && portCandidate <= 65_535 ? portCandidate : 3001,
    appOrigins: parseOrigins(env.APP_ORIGIN),
    trustProxyHops: Number.isSafeInteger(proxyHopsCandidate) && proxyHopsCandidate >= 0 && proxyHopsCandidate <= 5 ? proxyHopsCandidate : 0,
    databaseUrl: validDatabaseUrl(nonEmpty(env.DATABASE_URL)),
    telegramBotToken: botToken,
    telegramBotUsername: usernameCandidate && BOT_USERNAME_RE.test(usernameCandidate) ? usernameCandidate : null,
    telegramChannelId: channelCandidate && CHANNEL_ID_RE.test(channelCandidate) && isSignedBigInt(channelCandidate) ? channelCandidate : null,
    telegramAdminIds: parsePositiveIds(nonEmpty(env.TELEGRAM_ADMIN_IDS)),
    telegramWebhookSecret: (() => {
      const secret = nonEmpty(env.TELEGRAM_WEBHOOK_SECRET);
      return secret && WEBHOOK_SECRET_RE.test(secret) ? secret : null;
    })(),
    telegramChannelInviteUrl: inviteIsTelegram ? channelInviteUrl : null,
    telegramInitDataMaxAge: parseMaxAge(env.TELEGRAM_INIT_DATA_MAX_AGE),
    publicBaseUrl: validHttpsUrl(nonEmpty(env.PUBLIC_BASE_URL)),
    miniAppUrl: validHttpsUrl(nonEmpty(env.MINI_APP_URL)),
    telegramConfigured: Boolean(botToken),
    databaseConfigured: Boolean(validDatabaseUrl(nonEmpty(env.DATABASE_URL))),
    channelConfigured: Boolean(channelCandidate && CHANNEL_ID_RE.test(channelCandidate) && isSignedBigInt(channelCandidate)),
  });
}

export const configInternals = Object.freeze({ BOT_USERNAME_RE, CHANNEL_ID_RE, POSITIVE_ID_RE, WEBHOOK_SECRET_RE });
