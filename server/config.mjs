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

function isNonPublicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = host.split('.').map(Number);
  const isPrivateIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (() => {
    const [a, b] = ipv4;
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  })();
  const reservedHost = host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.lan')
    || host.endsWith('.home.arpa')
    || host === 'example.com'
    || host.endsWith('.example.com')
    || host.endsWith('.example')
    || host.endsWith('.invalid')
    || host.endsWith('.test')
    || host.endsWith('.manus.computer')
    || host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || /^fe[89ab][0-9a-f]:/i.test(host);
  return reservedHost || isPrivateIpv4;
}

function validPublicHttpsUrl(value) {
  const url = validHttpsUrl(value);
  if (!url) return null;
  try {
    return isNonPublicHostname(new URL(url).hostname) ? null : url;
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
  // Render places one trusted reverse proxy in front of the service. Keep local/dev strict.
  const proxyHopsCandidate = Number(env.TRUST_PROXY_HOPS ?? (env.RENDER_EXTERNAL_URL ? 1 : 0));

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
    audioRecognitionApiKey: nonEmpty(env.AUDIO_RECOGNITION_API_KEY),
    youtubeDataApiKey: nonEmpty(env.YOUTUBE_API_KEY),
    tmdbApiKey: nonEmpty(env.TMDB_API_KEY),
    publicBaseUrl: validPublicHttpsUrl(nonEmpty(env.PUBLIC_BASE_URL)),
    miniAppUrl: validPublicHttpsUrl(nonEmpty(env.MINI_APP_URL)),
    telegramConfigured: Boolean(botToken),
    databaseConfigured: Boolean(validDatabaseUrl(nonEmpty(env.DATABASE_URL))),
    channelConfigured: Boolean(channelCandidate && CHANNEL_ID_RE.test(channelCandidate) && isSignedBigInt(channelCandidate)),
    tmdbConfigured: Boolean(nonEmpty(env.TMDB_API_KEY)),
    youtubeConfigured: Boolean(nonEmpty(env.YOUTUBE_API_KEY)),
  });
}

export const configInternals = Object.freeze({ BOT_USERNAME_RE, CHANNEL_ID_RE, POSITIVE_ID_RE, WEBHOOK_SECRET_RE });
