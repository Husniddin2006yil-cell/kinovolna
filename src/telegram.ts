export type FilmActionResult =
  | { ok: true; url?: string }
  | { ok: false; reason: 'not-configured' | 'failed' };

type TelegramWebApp = {
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  initData?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '');

export function getTelegramWebApp() {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

export function openFilmInTelegram(filmId: string): FilmActionResult {
  if (!botUsername) return { ok: false, reason: 'not-configured' };
  const url = `https://t.me/${botUsername}?startapp=film_${encodeURIComponent(filmId)}`;
  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink) webApp.openTelegramLink(url);
  else if (webApp?.openLink) webApp.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, url };
}

export async function requestFilmPlayback(filmId: string): Promise<FilmActionResult> {
  if (!apiBaseUrl) return { ok: false, reason: 'not-configured' };
  try {
    const response = await fetch(`${apiBaseUrl}/api/films/${encodeURIComponent(filmId)}/playback`, {
      headers: {
        Accept: 'application/json',
        ...(getTelegramWebApp()?.initData ? { 'X-Telegram-Init-Data': getTelegramWebApp()!.initData! } : {}),
      },
    });
    if (!response.ok) return { ok: false, reason: 'failed' };
    const payload = (await response.json()) as { url?: string };
    if (!payload.url) return { ok: false, reason: 'failed' };
    window.open(payload.url, '_blank', 'noopener,noreferrer');
    return { ok: true, url: payload.url };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
