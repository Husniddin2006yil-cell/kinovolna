import { createHash } from 'node:crypto';

const API_URL = 'https://commons.wikimedia.org/w/api.php';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const ALLOWED_AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/vnd.wave']);
const ALLOWED_LICENSE_HOSTS = new Set(['creativecommons.org', 'www.creativecommons.org', 'gnu.org', 'www.gnu.org', 'commons.wikimedia.org']);
const COVER_STYLES = ['cover-moon', 'cover-blue', 'cover-dusk', 'cover-green'];
const USER_AGENT = 'KinovolnaAudioSearch/1.0 (Wikimedia Commons API client)';

export class CommonsAudioError extends Error {
  constructor(code = 'music_source_unavailable') {
    super('Wikimedia Commons audio search failed.');
    this.name = 'CommonsAudioError';
    this.code = code;
  }
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code) => {
      const point = parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function metadataValue(metadata, key) {
  return plainText(metadata?.[key]?.value ?? '');
}

function allowedLicense(name) {
  const normalized = name.replace(/\s+/g, ' ').trim();
  if (!normalized || /^cc\s*by-(?:nc|nd)/i.test(normalized)) return false;
  return /^(?:public domain(?: mark)?\b|cc\s*0\b|creative commons zero\b|cc\s*by(?:-sa)?\b|creative commons attribution(?:-sharealike)?\b)/i.test(normalized);
}

function trustedHttps(value, host) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host ? url.href : null;
  } catch {
    return null;
  }
}

function trustedLicenseUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_LICENSE_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0 || value > 24 * 60 * 60) return '—';
  const wholeSeconds = Math.floor(value);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function fileTitle(page) {
  const title = String(page?.title ?? '').replace(/^File:/i, '').replaceAll('_', ' ');
  return title || '';
}

function isPlayableCandidate(page) {
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  const mime = String(info?.mime ?? '').split(';', 1)[0].trim().toLowerCase();
  return Number.isSafeInteger(page?.pageid)
    && ALLOWED_AUDIO_MIME.has(mime)
    && Boolean(trustedHttps(info?.url, 'upload.wikimedia.org'))
    && Boolean(trustedHttps(info?.descriptionurl, 'commons.wikimedia.org'));
}

function mapAudioPage(page, index) {
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  const metadata = info?.extmetadata ?? {};
  const mime = String(info?.mime ?? '').split(';', 1)[0].trim().toLowerCase();
  const audioUrl = trustedHttps(info?.url, 'upload.wikimedia.org');
  const licenseName = metadataValue(metadata, 'LicenseShortName');
  const licenseUrl = trustedLicenseUrl(metadataValue(metadata, 'LicenseUrl'));
  const sourceUrl = trustedHttps(info?.descriptionurl, 'commons.wikimedia.org');
  const titleFromMetadata = metadataValue(metadata, 'ObjectName');
  const title = (titleFromMetadata || fileTitle(page).replace(/\.[^.]+$/, '')).slice(0, 180);
  const artist = metadataValue(metadata, 'Artist') || metadataValue(metadata, 'Credit');
  if (!ALLOWED_AUDIO_MIME.has(mime) || !audioUrl || !sourceUrl || !title || !artist || !allowedLicense(licenseName) || !licenseUrl) return null;

  const thumbnailUrl = trustedHttps(info?.thumburl, 'upload.wikimedia.org');
  const id = `commons-${createHash('sha1').update(String(page.pageid)).digest('hex').slice(0, 14)}`;
  return {
    id,
    title,
    artist,
    album: 'Свободный аудиоархив',
    duration: formatDuration(info?.duration),
    coverStyle: COVER_STYLES[index % COVER_STYLES.length],
    tone: licenseName,
    licenseName,
    licenseUrl,
    moods: [],
    audioUrl,
    sourceUrl,
    source: 'commons',
    thumbnailUrl,
  };
}

export function createCommonsAudioSearch({ fetchImpl = fetch, now = () => Date.now(), cache = new Map() } = {}) {
  return async function searchCommonsAudio(query, limit = 20) {
    const normalized = String(query ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const safeLimit = Math.min(20, Math.max(1, Number.isSafeInteger(limit) ? limit : 20));
    if (normalized.length < 2) return [];
    const cacheKey = `${normalized.toLocaleLowerCase()}|${safeLimit}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.items;
    if (cached) cache.delete(cacheKey);

    const searchUrl = new URL(API_URL);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('formatversion', '2');
    searchUrl.searchParams.set('origin', '*');
    searchUrl.searchParams.set('generator', 'search');
    searchUrl.searchParams.set('gsrnamespace', '6');
    searchUrl.searchParams.set('gsrsearch', `filetype:audio ${normalized}`);
    searchUrl.searchParams.set('gsrlimit', '20');
    searchUrl.searchParams.set('prop', 'imageinfo');
    searchUrl.searchParams.set('iiprop', 'url|mime');
    searchUrl.searchParams.set('iiurlwidth', '320');

    const requestJson = async (url) => {
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        throw new CommonsAudioError();
      }
      if (!response?.ok) throw new CommonsAudioError();
      const payload = await response.json().catch(() => null);
      if (!payload || !Array.isArray(payload?.query?.pages)) throw new CommonsAudioError();
      return payload.query.pages;
    };

    const candidates = (await requestJson(searchUrl)).filter(isPlayableCandidate).slice(0, safeLimit);
    let items = [];
    if (candidates.length) {
      const metadataUrl = new URL(API_URL);
      metadataUrl.searchParams.set('action', 'query');
      metadataUrl.searchParams.set('format', 'json');
      metadataUrl.searchParams.set('formatversion', '2');
      metadataUrl.searchParams.set('pageids', candidates.map((page) => page.pageid).join('|'));
      metadataUrl.searchParams.set('prop', 'imageinfo');
      metadataUrl.searchParams.set('iiprop', 'url|mime|extmetadata');
      metadataUrl.searchParams.set('iiextmetadatafilter', 'Artist|ObjectName|LicenseShortName|LicenseUrl|Credit');
      metadataUrl.searchParams.set('iiurlwidth', '320');
      const pages = await requestJson(metadataUrl);
      const pagesById = new Map(pages.map((page) => [page.pageid, page]));
      items = candidates.map((candidate, index) => mapAudioPage(pagesById.get(candidate.pageid), index)).filter(Boolean);
    }

    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { expiresAt: now() + CACHE_TTL_MS, items });
    return items;
  };
}

export const searchCommonsAudio = createCommonsAudioSearch();
