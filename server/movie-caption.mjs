const CHANNEL_HANDLE = '@[A-Za-z][A-Za-z0-9_]{4,31}';
const LINK = '(?:(?:https?|tg):\\/\\/|(?:www\\.|t\\.me\\/))[^\\s<>{}\\[\\]|\\\\]+';
const SEPARATOR = '[:|•—–-]';

/**
 * Produces a plain, title-only caption for a copied channel post.
 *
 * Catalog titles are normally already a single first line. This additionally
 * removes common channel attribution, forwarding labels, and URLs that may be
 * present in older or manually imported rows without changing ordinary title
 * text. Telegram entities are disabled separately in movieCopyOptions.
 */
export function plainMovieCaption(title) {
  let caption = typeof title === 'string' ? title : '';
  caption = caption.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');

  // Remove links before testing whether a trailing channel handle is metadata.
  caption = caption.replace(new RegExp(LINK, 'giu'), ' ');
  caption = caption.replace(new RegExp(`(?:^|\\s|${SEPARATOR})` +
    `(?:forwarded\\s+(?:message\\s+)?from|переслано\\s+(?:сообщение\\s+)?(?:от|из))\\s+${CHANNEL_HANDLE}(?:\\s*${SEPARATOR}\\s*)?(?=$|\\s|${SEPARATOR})`, 'giu'), ' ');

  // Handles are removed only when they are standalone attribution at the start
  // or end of a title. A handle inside normal title text is left intact.
  caption = caption.replace(new RegExp(`^${CHANNEL_HANDLE}\\s*$`, 'u'), '');
  caption = caption.replace(new RegExp(`^${CHANNEL_HANDLE}(?:\\s*(?:${SEPARATOR})\\s*|\\s+)`, 'u'), '');
  caption = caption.replace(new RegExp(`(?:\\s*(?:${SEPARATOR})\\s*|\\s+)${CHANNEL_HANDLE}(?=\\s*$|\\s*${SEPARATOR}\\s*$)`, 'gu'), ' ');

  caption = caption
    .replace(new RegExp(`\\(\\s*${CHANNEL_HANDLE}\\s*\\)|\\[\\s*${CHANNEL_HANDLE}\\s*\\]`, 'giu'), ' ')
    .replace(/[([]\\s*[)\\]]/g, ' ')
    .replace(new RegExp(`\\s*${SEPARATOR}\\s*$`, 'u'), '')
    .replace(/\s+/g, ' ')
    .trim();

  // The catalog parser/importer limits titles to 500 characters; the final cap
  // also protects the Bot API caption limit for historical rows.
  return (caption || 'Фильм').slice(0, 1024);
}

/** Options that guarantee a copied movie has a clean caption and no source UI. */
export function movieCopyOptions(title) {
  return {
    protect_content: true,
    caption: plainMovieCaption(title),
    caption_entities: [],
    reply_markup: { inline_keyboard: [] },
  };
}
