import type { Film } from './data';

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
  initData?: string;
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
      film_not_found: 'Публикация фильма не найдена в серверном каталоге.',
    };
    throw new CatalogApiError(response.status, code, messages[code] ?? payload?.message ?? payload?.error?.message ?? 'Не удалось выполнить запрос к backend.');
  }
  return payload;
}

export async function loadTelegramCatalog() {
  const config = await apiRequest<{ telegramConfigured: boolean; databaseConfigured: boolean; channelConfigured: boolean }>('/api/config');
  if (!config.telegramConfigured || !config.databaseConfigured || !config.channelConfigured) {
    throw new CatalogApiError(503, 'configuration_required', 'Нужны серверный токен бота, ID канала и PostgreSQL. Демо-каталог доступен отдельно.');
  }
  const initData = getTelegramWebApp()?.initData;
  if (!initData) throw new CatalogApiError(401, 'init_data_required', 'Откройте Mini App из вашего Telegram-бота для доступа к закрытому каталогу.');
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
    if (!Array.isArray(page.items) || !page.pagination || !Number.isSafeInteger(page.pagination.total)) {
      throw new CatalogApiError(502, 'invalid_catalog', 'Backend вернул некорректный каталог.');
    }
    films.push(...page.items);
    total = page.pagination.total;
    offset += page.items.length;
    if (!page.items.length && offset < total) throw new CatalogApiError(502, 'invalid_pagination', 'Не удалось загрузить полный каталог.');
    if (offset > 10000) throw new CatalogApiError(413, 'catalog_too_large', 'Каталог слишком большой для одной загрузки. Нужна серверная постраничная навигация.');
  } while (offset < total);
  return { films, user: auth.user, startParam: auth.startParam };
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
    window.location.assign(url.href);
    return { ok: true, url: url.href };
  } catch (error) {
    return { ok: false, reason: error instanceof CatalogApiError && error.code === 'video_source_not_configured' ? 'not-configured' : 'failed', message: error instanceof CatalogApiError ? error.message : 'Не удалось открыть источник видео.' };
  }
}
