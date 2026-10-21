import process from 'node:process';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const miniAppUrl = process.env.MINI_APP_URL?.trim();
const adminIds = new Set((process.env.TELEGRAM_ADMIN_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const apiBaseUrl = process.env.API_BASE_URL?.trim().replace(/\/$/, '');
const pollTimeout = 30;

function requireConfig() {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  if (!miniAppUrl) throw new Error('MINI_APP_URL is not configured; refusing to use a fake Mini App URL.');
  let parsed;
  try { parsed = new URL(miniAppUrl); } catch { throw new Error('MINI_APP_URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:') throw new Error('MINI_APP_URL must use HTTPS in production.');
  if (/example\.com|localhost|127\.0\.0\.1/i.test(parsed.hostname)) throw new Error('MINI_APP_URL is a placeholder or local URL.');
}

const apiUrl = (method, query = '') => `https://api.telegram.org/bot${token}/${method}${query}`;
async function telegram(method, body) {
  const response = await fetch(apiUrl(method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram API ${method} failed`);
  return payload.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram('sendMessage', { chat_id: chatId, text, ...extra });
}

function mainKeyboard() {
  return { inline_keyboard: [[{ text: '🎬 Открыть КИНОВОЛНУ', web_app: { url: miniAppUrl } }]] };
}

function isAdmin(userId) { return adminIds.has(String(userId)); }
function adminKeyboard() {
  return { inline_keyboard: [
    [{ text: '🎞 Управление каталогом', callback_data: 'admin_catalog' }],
    [{ text: '📊 Статистика', callback_data: 'admin_stats' }, { text: '🔌 Состояние интеграций', callback_data: 'admin_health' }],
  ] };
}

async function backendRequest(path) {
  if (!apiBaseUrl) return { configured: false };
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { headers: { accept: 'application/json' } });
    return { configured: true, ok: response.ok, status: response.status, payload: response.ok ? await response.json() : undefined };
  } catch {
    return { configured: true, ok: false, status: 0 };
  }
}

const welcome = 'Добро пожаловать в КИНОВОЛНА! 🍿 Твой мир кино и музыки начинается здесь. Открывай фильмы и сериалы, находи любимые истории и исследуй мир музыки. Готов выбрать, что посмотреть сегодня?';
const help = ['Команды КИНОВОЛНА:', '/start — открыть КИНОВОЛНУ', '/help — краткая инструкция', '/id — показать ваш Telegram ID', '', 'Выберите фильм или сериал в Mini App. Если вы администратор, используйте отдельное меню администратора.'].join('\n');

async function handleCommand(message, command, args) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  if (command === '/start') {
    if (!miniAppUrl) return sendMessage(chatId, `${welcome}\n\nMini App пока не опубликован: администратор должен добавить настоящий production URL в MINI_APP_URL.`);
    return sendMessage(chatId, welcome, { reply_markup: mainKeyboard() });
  }
  if (command === '/help') return sendMessage(chatId, help);
  if (command === '/id') return sendMessage(chatId, `Ваш Telegram ID: ${userId}`);
  if (command === '/admin') {
    if (!isAdmin(userId)) return sendMessage(chatId, 'У вас нет доступа к меню администратора.');
    return sendMessage(chatId, 'Панель администратора КИНОВОЛНА\n\nВыберите действие:', { reply_markup: adminKeyboard() });
  }
  if (command.startsWith('/')) return sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка доступных команд.');
  if (args) return sendMessage(chatId, 'Чтобы открыть каталог, нажмите кнопку «🎬 Открыть КИНОВОЛНУ».');
}

async function handleCallback(callback) {
  const userId = callback.from?.id;
  const chatId = callback.message?.chat?.id;
  await telegram('answerCallbackQuery', { callback_query_id: callback.id });
  if (!chatId || !isAdmin(userId)) return;
  if (callback.data === 'admin_catalog') {
    const result = await backendRequest('/api/admin/catalog');
    if (!result.configured) return sendMessage(chatId, 'Управление каталогом подготовлено, но backend ещё не подключён. Реальный каталог не изменён.');
    if (!result.ok) return sendMessage(chatId, `Не удалось получить состояние каталога через backend (HTTP ${result.status || 'ошибка'}).`);
    return sendMessage(chatId, 'Backend каталога отвечает. Операции добавления и редактирования будут доступны после определения защищённых admin endpoint-ов.');
  }
  if (callback.data === 'admin_stats') {
    const result = await backendRequest('/api/admin/stats');
    if (!result.configured) return sendMessage(chatId, 'Статистика недоступна: backend не подключён. Фиктивные цифры не показываются.');
    if (!result.ok) return sendMessage(chatId, `Статистика не получена через backend (HTTP ${result.status || 'ошибка'}).`);
    return sendMessage(chatId, `Статистика backend получена:\n${JSON.stringify(result.payload, null, 2).slice(0, 3500)}`);
  }
  if (callback.data === 'admin_health') {
    const bot = await telegram('getMe');
    const backend = await backendRequest('/health');
    const backendLine = !backend.configured ? 'backend: не настроен' : backend.ok ? 'backend: отвечает' : `backend: ошибка (${backend.status || 'сеть'})`;
    return sendMessage(chatId, `Состояние интеграций:\nTelegram Bot API: отвечает как @${bot.username}\n${backendLine}`);
  }
}

async function run() {
  requireConfig();
  const bot = await telegram('getMe');
  console.log(`КИНОВОЛНА bot is ready as @${bot.username}`);
  let offset = 0;
  while (true) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: pollTimeout, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.callback_query) await handleCallback(update.callback_query);
        const message = update.message;
        if (message?.text) {
          const [command, ...args] = message.text.trim().split(/\s+/);
          await handleCommand(message, command.toLowerCase(), args.join(' '));
        }
      }
    } catch (error) {
      console.error(`Telegram polling error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

run().catch((error) => { console.error(`Bot startup failed: ${error.message}`); process.exitCode = 1; });
