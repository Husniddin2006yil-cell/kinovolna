const TELEGRAM_API = 'https://api.telegram.org';

export class TelegramApiError extends Error {
  constructor(message = 'Ошибка запроса к Telegram API') {
    super(message);
    this.name = 'TelegramApiError';
  }
}

function requireToken(token) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('A Telegram bot token is required');
  return token.trim();
}

/** Creates a small, explicit Telegram Bot API client. It never logs request URLs. */
export function createTelegramClient(token) {
  const safeToken = requireToken(token);

  async function call(method, parameters = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${TELEGRAM_API}/bot${safeToken}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(parameters),
        signal: controller.signal,
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new TelegramApiError('Telegram API вернул некорректный ответ');
      }
      if (!response.ok || !payload?.ok) {
        throw new TelegramApiError(`Telegram API отклонил вызов ${method}`);
      }
      return payload.result;
    } catch (error) {
      if (error instanceof TelegramApiError) throw error;
      throw new TelegramApiError('Ошибка запроса к Telegram API');
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    call,
    getMe: () => call('getMe'),
    getChat: (chatId) => call('getChat', { chat_id: chatId }),
    getChatMember: (chatId, userId) => call('getChatMember', { chat_id: chatId, user_id: userId }),
    getWebhookInfo: () => call('getWebhookInfo'),
    setWebhook: (options) => call('setWebhook', options),
    setChatMenuButton: (options) => call('setChatMenuButton', options),
    sendMessage: (chatId, text, options = {}) => call('sendMessage', { chat_id: chatId, text, ...options }),
    copyMessage: (chatId, fromChatId, messageId, options = {}) => call('copyMessage', { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId, ...options }),
    getFile: (fileId) => call('getFile', { file_id: fileId }),
  });
}
