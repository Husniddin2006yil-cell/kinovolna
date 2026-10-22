import 'dotenv/config';
import { readConfig } from '../server/config.mjs';
import { createTelegramClient } from '../server/telegram.mjs';
import { getTelegramDiagnostics } from '../server/telegram-diagnostics.mjs';

const command = process.argv[2] || 'check';
const replaceWebhook = process.argv.includes('--replace-webhook');
const config = readConfig();

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function needTelegram() {
  if (!config.telegramConfigured) throw new Error('Требуется TELEGRAM_BOT_TOKEN.');
  return createTelegramClient(config.telegramBotToken);
}

async function check() {
  const telegram = needTelegram();
  const diagnostics = await getTelegramDiagnostics(config, telegram);
  console.log(JSON.stringify(diagnostics, null, 2));
  if (!diagnostics.botApiReachable) throw new Error(diagnostics.errors.getMe || 'Telegram Bot API check failed.');
  if (diagnostics.errors.getWebhookInfo) throw new Error(diagnostics.errors.getWebhookInfo);
  if (config.telegramBotUsername && diagnostics.botUsername?.toLowerCase() !== config.telegramBotUsername.toLowerCase()) {
    throw new Error('TELEGRAM_BOT_USERNAME не соответствует боту из настроенного токена.');
  }
  if (config.channelConfigured && diagnostics.channelType !== 'channel') {
    throw new Error('TELEGRAM_CHANNEL_ID должен указывать на Telegram-канал.');
  }
  if (config.channelConfigured && !diagnostics.botIsChannelAdmin) {
    throw new Error('Бот должен быть администратором TELEGRAM_CHANNEL_ID.');
  }
}

async function webhook() {
  if (!config.publicBaseUrl || !config.telegramWebhookSecret) {
    throw new Error('Требуются PUBLIC_BASE_URL (HTTPS) и TELEGRAM_WEBHOOK_SECRET.');
  }
  const target = `${config.publicBaseUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const telegram = needTelegram();
  const current = await telegram.getWebhookInfo();
  if (current?.url && current.url !== target && !replaceWebhook) {
    throw new Error('Существующий webhook ведёт на другой URL. Запустите с --replace-webhook только для осознанной замены.');
  }
  await telegram.setWebhook({
    url: target,
    secret_token: config.telegramWebhookSecret,
    allowed_updates: ['channel_post', 'edited_channel_post', 'message', 'callback_query'],
    drop_pending_updates: false,
  });
  console.log(JSON.stringify({ status: 'webhook_set', replacedExistingWebhook: Boolean(current?.url && current.url !== target) }));
}

async function menu() {
  if (!config.miniAppUrl) throw new Error('MINI_APP_URL должен быть HTTPS URL.');
  const telegram = needTelegram();
  await telegram.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Открыть приложение', web_app: { url: config.miniAppUrl } },
  });
  console.log(JSON.stringify({ status: 'menu_set' }));
}

try {
  if (command === 'check') await check();
  else if (command === 'webhook') await webhook();
  else if (command === 'menu') await menu();
  else throw new Error('Использование: telegram-setup.mjs [check|webhook|menu] [--replace-webhook]');
} catch (error) {
  // Telegram errors are already sanitised by the client; never print request details.
  fail(error instanceof Error ? error.message : 'Не удалось настроить Telegram.');
}
