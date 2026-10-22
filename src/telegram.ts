import type { Film, Track } from './data';

export type FilmActionResult =
  | { ok: true; url?: string }
  | { ok: false; reason: 'not-configured' | 'failed'; message?: string };

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  ready?: () => void;
  expand?: () => void;
  initData?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isActive?: boolean;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function getTelegramWebApp() {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

export type PublicApiConfig = { audioRecognitionConfigured: boolean };

export async function getPublicConfig(): Promise<PublicApiConfig> {
  const payload = await apiRequest<{ audioRecognitionConfigured?: unknown }>('/api/config');
  if (typeof payload.audioRecognitionConfigured !== 'boolean') {
    throw new CatalogApiError(502, 'invalid_public_config', 'Не удалось проверить настройки аудиосервиса.');
  }
  return { audioRecognitionConfigured: payload.audioRecognitionConfigured };
}

export class CatalogApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const initData = getTelegramWebApp()?.initData;
  if (initData) headers.set('X-Telegram-Init-Data', initData);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch {
    throw new CatalogApiError(0, 'network_error', 'Backend недоступен. Проверьте соединение и адрес API.');
  }
  const payload = await response.json().catch(() => null) as (T & { code?: string; message?: string; error?: { code?: string; message?: string } }) | null;
  if (!response.ok || payload === null) {
    const code = payload?.code ?? payload?.error?.code ?? 'api_error';
    const messages: Record<string, string> = {
      configuration_required: 'Для Telegram не настроены серверный токен, канал или база данных.',
      telegram_not_configured: 'Telegram-бот не настроен на сервере.',
      database_not_configured: 'На сервере не настроена PostgreSQL.',
      channel_not_configured: 'На сервере не указан Telegram-канал.',
      init_data_required: 'Откройте Mini App из вашего Telegram-бота: каталог закрытого канала защищён.',
      invalid_init_data: 'Telegram-вход не подтверждён. Откройте Mini App заново.',
      init_data_expired: 'Telegram-сессия истекла. Закройте и снова откройте Mini App.',
      expired_init_data: 'Telegram-сессия истекла. Закройте и снова откройте Mini App.',
      channel_membership_required: 'Для доступа нужно вступить в закрытый канал.',
      membership_check_failed: 'Не удалось проверить подписку в Telegram. Повторите позже.',
      membership_required: 'Для доступа нужно вступить в закрытый канал.',
      channel_access_denied: 'Для доступа нужно вступить в закрытый канал.',
      telegram_unavailable: 'Telegram временно недоступен. Повторите позже.',
      video_source_not_configured: 'Реальный разрешённый источник онлайн-видео не подключён.',
      music_source_unavailable: 'Свободный аудиоархив временно недоступен. Попробуйте позже.',
      music_rate_limited: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
      video_too_large: 'Этот файл больше 20 МБ — Telegram Bot API не позволяет безопасно воспроизводить его в веб-плеере. Используйте «Отправить в бот».',
      telegram_file_unavailable: 'Telegram временно не отдаёт этот видеофайл. Используйте «Отправить в бот».',
      film_not_found: 'Публикация фильма не найдена в серверном каталоге.',
    };
    throw new CatalogApiError(response.status, code, messages[code] ?? payload?.message ?? payload?.error?.message ?? 'Не удалось выполнить запрос к backend.');
  }
  return payload;
}

function normalizeCatalogTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function mergeTelegramAndTmdbFilms(tmdbFilms: Film[], telegramFilms: Film[]): Film[] {
  const merged = new Map<string, Film>();
  for (const film of tmdbFilms) merged.set(normalizeCatalogTitle(film.title) || film.id, film);
  for (const telegramFilm of telegramFilms) {
    const key = normalizeCatalogTitle(telegramFilm.title) || telegramFilm.id;
    const tmdbFilm = merged.get(key);
    // Channel-only films stay hidden from Mini App. They remain indexed on the
    // server so a matching TMDB card can still send the real post to the bot.
    if (!tmdbFilm) continue;
    merged.set(key, {
      ...tmdbFilm,
      // Keep TMDB title/poster/rating visible; the channel row is resolved
      // later only when the user presses “Отправить в бот”.
      source: 'tmdb',
    });
  }
  return [...merged.values()];
}

export async function loadTelegramCatalog() {
  const config = await apiRequest<{ telegramConfigured: boolean; databaseConfigured: boolean; channelConfigured: boolean; tmdbConfigured: boolean }>('/api/config');
  const initData = getTelegramWebApp()?.initData;
  if (initData && config.telegramConfigured && config.databaseConfigured && config.channelConfigured) {
    const auth = await apiRequest<{ user: TelegramUser; startParam?: string }>('/api/telegram/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const films: Film[] = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await apiRequest<{ items: Film[]; pagination: { total: number; limit: number; offset: number } }>(`/api/films?limit=100&offset=${offset}`);
      if (!Array.isArray(page.items) || !page.pagination || !Number.isSafeInteger(page.pagination.total)) throw new CatalogApiError(502, 'invalid_catalog', 'Backend вернул некорректный каталог.');
      films.push(...page.items);
      total = page.pagination.total;
      offset += page.items.length;
      if (!page.items.length && offset < total) throw new CatalogApiError(502, 'invalid_pagination', 'Не удалось загрузить полный каталог.');
      if (offset > 10000) throw new CatalogApiError(413, 'catalog_too_large', 'Каталог слишком большой для одной загрузки. Нужна серверная постраничная навигация.');
    } while (offset < total);
    if (config.tmdbConfigured) {
      const tmdbFilms: Film[] = [];
      let tmdbOffset = 0;
      let tmdbTotal = 0;
      do {
        const page = await apiRequest<{ items: Film[]; pagination: { total: number; limit: number; offset: number } }>(`/api/catalog?limit=100&offset=${tmdbOffset}&category=popular`);
        if (!Array.isArray(page.items) || !page.pagination || !Number.isSafeInteger(page.pagination.total)) throw new CatalogApiError(502, 'invalid_catalog', 'Backend вернул некорректный каталог TMDB.');
        tmdbFilms.push(...page.items);
        tmdbTotal = page.pagination.total;
        tmdbOffset += page.items.length;
        if (!page.items.length && tmdbOffset < tmdbTotal) throw new CatalogApiError(502, 'invalid_pagination', 'Не удалось загрузить полный каталог TMDB.');
      } while (tmdbOffset < tmdbTotal);
      return { films: mergeTelegramAndTmdbFilms(tmdbFilms, films), user: auth.user, startParam: auth.startParam, mode: films.length ? 'telegram' as const : 'tmdb' as const };
    }
    return { films, user: auth.user, startParam: auth.startParam, mode: 'telegram' as const };
  }
  if (config.databaseConfigured && config.tmdbConfigured) {
    const page = await apiRequest<{ items: Film[]; pagination: { total: number; limit: number; offset: number } }>('/api/catalog?limit=100&category=popular');
    if (!Array.isArray(page.items) || !page.pagination) throw new CatalogApiError(502, 'invalid_catalog', 'Backend вернул некорректный каталог TMDB.');
    return { films: page.items, user: null, startParam: undefined, mode: 'tmdb' as const };
  }
  throw new CatalogApiError(503, 'configuration_required', 'Нужны серверный токен бота, ID канала и PostgreSQL. Демо-каталог доступен отдельно.');
}

// The server alone resolves actual indexed posts. Never build links for demo IDs.
export async function openFilmInTelegram(filmId: string): Promise<FilmActionResult> {
  try {
    const payload = await apiRequest<{ url: string; mode: 'bot' | 'channel' }>(`/api/films/${encodeURIComponent(filmId)}/telegram`);
    const url = new URL(payload.url);
    if (url.protocol !== 'https:' || url.hostname !== 't.me' || url.username || url.password) throw new Error('Invalid Telegram URL');
    const webApp = getTelegramWebApp();
    if (webApp?.openTelegramLink) webApp.openTelegramLink(url.href);
    else window.location.assign(url.href);
    return { ok: true, url: url.href };
  } catch (error) {
    return { ok: false, reason: error instanceof CatalogApiError && error.status === 503 ? 'not-configured' : 'failed', message: error instanceof CatalogApiError ? error.message : 'Не удалось открыть публикацию Telegram.' };
  }
}

export async function requestFilmPlayback(filmId: string): Promise<FilmActionResult> {
  try {
    // This stage deliberately supplies no video URL. Preserve the adapter for a real source later.
    const payload = await apiRequest<{ url?: string }>(`/api/films/${encodeURIComponent(filmId)}/playback`);
    if (!payload.url) return { ok: false, reason: 'not-configured', message: 'Источник онлайн-видео не подключён.' };
    const url = new URL(payload.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid media URL');
    return { ok: true, url: url.href };
  } catch (error) {
    return { ok: false, reason: error instanceof CatalogApiError && error.code === 'video_source_not_configured' ? 'not-configured' : 'failed', message: error instanceof CatalogApiError ? error.message : 'Не удалось открыть источник видео.' };
  }
}

export async function searchTelegramFilms(query: string): Promise<Film[]> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 200) return [];
  const payload = await apiRequest<{ items: Film[] }>(`/api/films?limit=100&q=${encodeURIComponent(normalized)}`);
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function loadFilmDetail(filmId: string): Promise<Film> {
  return apiRequest<Film>(`/api/films/${encodeURIComponent(filmId)}`);
}

export async function loadNotificationPreference(): Promise<boolean> {
  const payload = await apiRequest<{ enabled: boolean }>('/api/notifications');
  return payload.enabled === true;
}

export async function setNotificationPreference(enabled: boolean): Promise<boolean> {
  const payload = await apiRequest<{ enabled: boolean }>('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return payload.enabled === true;
}

export type WatchProvidersResponse = {
  provider: string;
  region: string;
  link: string | null;
  providers: { name: string; category: string }[];
  attribution: string;
};

export async function requestTmdbWatchProviders(filmId: string, region = 'UZ'): Promise<WatchProvidersResponse> {
  if (!/^tmdb-(movie|tv)-\d+$/.test(filmId) || !/^[A-Za-z]{2}$/.test(region)) {
    throw new CatalogApiError(400, 'invalid_watch_provider_request', 'Некорректный запрос легальных видеоплощадок.');
  }
  const payload = await apiRequest<WatchProvidersResponse>(`/api/catalog/${encodeURIComponent(filmId)}/watch-providers?region=${encodeURIComponent(region.toUpperCase())}`);
  if (!Array.isArray(payload.providers) || typeof payload.region !== 'string') {
    throw new CatalogApiError(502, 'invalid_watch_provider_response', 'Список видеоплощадок имеет неверный формат.');
  }
  if (payload.link) {
    let url: URL;
    try {
      url = new URL(payload.link);
    } catch {
      throw new CatalogApiError(502, 'invalid_watch_provider_link', 'TMDB вернул некорректную ссылку.');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'www.themoviedb.org' || !/\/watch(?:\/|$)/.test(url.pathname)) {
      throw new CatalogApiError(502, 'invalid_watch_provider_link', 'TMDB вернул небезопасную ссылку.');
    }
  }
  return payload;
}

export type MusicRecognitionResult = {
  matched: boolean;
  track?: { artist: string | null; title: string | null; album: string | null; releaseDate: string | null; songLink: string | null };
};

export async function recognizeMusicSample(sample: Blob): Promise<MusicRecognitionResult> {
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': sample.type || 'audio/webm' });
  const initData = getTelegramWebApp()?.initData;
  if (initData) headers.set('X-Telegram-Init-Data', initData);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/music/recognize`, {
      method: 'POST', headers, body: sample, cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CatalogApiError(0, 'network_error', 'Сервис распознавания недоступен. Проверьте соединение.');
  }
  const payload = await response.json().catch(() => null) as (MusicRecognitionResult & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok || !payload) {
    throw new CatalogApiError(response.status, payload?.error?.code ?? 'recognition_failed', payload?.error?.message ?? 'Не удалось распознать аудиозапись.');
  }
  return payload;
}

export async function searchCommonsAudio(query: string): Promise<Track[]> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 120) return [];
  const payload = await apiRequest<{ items: Track[] }>(`/api/music/search?q=${encodeURIComponent(normalized)}`);
  if (!Array.isArray(payload.items)) throw new CatalogApiError(502, 'invalid_music_response', 'Аудиоархив вернул список неверного формата.');
  return payload.items.filter((item) => {
    try {
      const audio = new URL(item.audioUrl ?? '');
      const source = new URL(item.sourceUrl ?? '');
      const license = new URL(item.licenseUrl ?? '');
      return item.source === 'commons' && Boolean(item.title && item.artist && item.licenseName)
        && audio.protocol === 'https:' && audio.hostname === 'upload.wikimedia.org'
        && source.protocol === 'https:' && source.hostname === 'commons.wikimedia.org'
        && license.protocol === 'https:' && ['creativecommons.org', 'www.creativecommons.org', 'gnu.org', 'www.gnu.org', 'commons.wikimedia.org'].includes(license.hostname);
    } catch {
      return false;
    }
  });
}
