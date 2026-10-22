import fs from 'node:fs/promises';
import process from 'node:process';
import { plainMovieCaption } from '../server/movie-caption.mjs';

const input = process.argv[2];
if (!input) throw new Error('Использование: KINO_API_URL=https://... TELEGRAM_INIT_DATA=... node scripts/import-channel-export.mjs export.json');
const apiUrl = (process.env.KINO_API_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const initData = process.env.TELEGRAM_INIT_DATA;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
if (!/^https:\/\//.test(apiUrl) || !initData || !channelId) throw new Error('Нужны HTTPS KINO_API_URL, TELEGRAM_INIT_DATA и TELEGRAM_CHANNEL_ID. Значения не выводятся в лог.');

const exportData = JSON.parse(await fs.readFile(input, 'utf8'));
const messages = Array.isArray(exportData.messages) ? exportData.messages : [];
const textOf = (value) => Array.isArray(value) ? value.map((part) => typeof part === 'string' ? part : part?.text || '').join('') : typeof value === 'string' ? value : '';
const items = messages.filter((message) => message?.type === 'message' && Number.isSafeInteger(message.id) && (typeof message.file === 'string' || typeof message.photo === 'string'))
  .map((message) => {
    const raw = textOf(message.text || message.caption).trim();
    const title = plainMovieCaption(raw || message.file || `Публикация №${message.id}`);
    const yearMatch = title.match(/\b(?:19|20)\d{2}\b/);
    return {
      title,
      description: raw.slice(0, 4000),
      channelId: String(channelId),
      messageId: message.id,
      year: yearMatch ? Number(yearMatch[0]) : 0,
      genre: 'Не указан',
      kind: 'Фильм',
      poster: '/favicon.svg',
    };
  });
if (!items.length) throw new Error('В экспорте не найдены видео/фото-публикации с числовым id.');

let imported = 0;
for (let offset = 0; offset < items.length; offset += 100) {
  const response = await fetch(`${apiUrl}/api/admin/films/import`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
    body: JSON.stringify({ items: items.slice(offset, offset + 100) }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Import failed at batch ${Math.floor(offset / 100) + 1}: ${payload?.error?.message || payload?.message || response.status}`);
  imported += Number(payload?.imported || 0);
}
console.log(JSON.stringify({ imported, sourceMessages: items.length, note: 'Imported rows retain channel_id/message_id; the bot can copy the original post. Video playback still requires indexed video_file_id.' }));
