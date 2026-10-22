import fs from 'node:fs/promises';
import process from 'node:process';
import { plainMovieCaption } from '../server/movie-caption.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: KINO_API_URL=https://... TELEGRAM_INIT_DATA=... TELEGRAM_CHANNEL_ID=-100... node scripts/import-channel-export.mjs export.json');
const apiUrl = (process.env.KINO_API_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const initData = process.env.TELEGRAM_INIT_DATA;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
const statePath = process.env.IMPORT_STATE_FILE || `${input}.kinovolna-state.json`;
if (!/^https:\/\//.test(apiUrl) || !initData || !channelId) throw new Error('KINO_API_URL, TELEGRAM_INIT_DATA and TELEGRAM_CHANNEL_ID are required; values are never logged.');

const exportData = JSON.parse(await fs.readFile(input, 'utf8'));
const messages = Array.isArray(exportData.messages) ? exportData.messages : [];
const state = await fs.readFile(statePath, 'utf8').then(JSON.parse).catch(() => ({ done: {}, report: { checked: 0, candidates: 0, imported: 0, skipped: 0, errors: [] } }));
const textOf = (value) => Array.isArray(value) ? value.map((part) => typeof part === 'string' ? part : part?.text || '').join('') : typeof value === 'string' ? value : '';
const parsePart = (raw) => {
  const match = raw.match(/(?:s|season\s*)(\d{1,3})\s*(?:e|episode\s*)(\d{1,5})/i) || raw.match(/(\d{1,3})\s*[xх]\s*(\d{1,5})/i);
  return match ? { seasonNumber: Number(match[1]), episodeNumber: Number(match[2]) } : { seasonNumber: null, episodeNumber: null };
};
const items = [];
for (const message of messages) {
  if (message?.type !== 'message' || !Number.isSafeInteger(message.id) || (typeof message.file !== 'string' && typeof message.photo !== 'string')) continue;
  state.report.checked += 1;
  if (state.done[String(message.id)]) { state.report.skipped += 1; continue; }
  const raw = textOf(message.text || message.caption).trim();
  const title = plainMovieCaption(raw || message.file || `Публикация №${message.id}`);
  const part = parsePart(raw || title);
  const seriesTitle = part.episodeNumber ? title.replace(/(?:s|season\s*)\d{1,3}\s*(?:e|episode\s*)\d{1,5}|\d{1,3}\s*[xх]\s*\d{1,5}/i, '').replace(/[|—–:-]+\s*$/, '').trim() : null;
  const yearMatch = title.match(/\b(?:19|20)\d{2}\b/);
  items.push({ title, description: raw.slice(0, 4000), channelId: String(channelId), messageId: message.id, year: yearMatch ? Number(yearMatch[0]) : 0, genre: 'Не указан', kind: part.episodeNumber ? 'Сериал' : 'Фильм', poster: '/favicon.svg', ...(seriesTitle ? { seriesTitle, ...part } : {}) });
}
state.report.candidates += items.length;
for (let offset = 0; offset < items.length; offset += 100) {
  const batch = items.slice(offset, offset + 100);
  try {
    const response = await fetch(`${apiUrl}/api/admin/films/import`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ items: batch }), signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || String(response.status));
    state.report.imported += Number(payload?.imported || 0);
    for (const item of batch) state.done[String(item.messageId)] = true;
  } catch (error) {
    state.report.errors.push({ batch: Math.floor(offset / 100) + 1, message: String(error?.message || 'Import failed').slice(0, 200), messageIds: batch.map((item) => item.messageId) });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    throw error;
  }
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}
console.log(JSON.stringify({ ...state.report, stateFile: statePath, note: 'Re-run with the same state file to resume; channel/message uniqueness prevents duplicates. Uncertain titles are reported instead of invented.' }, null, 2));
