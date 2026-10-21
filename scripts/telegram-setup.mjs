import 'dotenv/config';
import { readConfig } from '../server/config.mjs';
import { createTelegramClient } from '../server/telegram.mjs';

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

function isChannelAdministrator(member) {
  return member?.status === 'creator' || member?.status === 'administrator';
}

async function check() {
  if (!config.channelConfigured) throw new Error('Требуется числовой TELEGRAM_CHANNEL_ID, начинающийся с -100.');
  if (!config.telegramBotUsername) throw new Error('Для проверки требуется корректный TELEGRAM_BOT_USERNAME.');
  const telegram = needTelegram();
  const [me, channel, webhook] = await Promise.all([telegram.getMe(), telegram.getChat(config.telegramChannelId), telegram.getWebhookInfo()]);
  if (!me?.id || !me?.username || me.username.toLowerCase() !== config.telegramBotUsername.toLowerCase()) {
    throw new Error('TELEGRAM_BOT_USERNAME не соответствует боту из настроенного токена.');
  }
  if (channel?.type !== 'channel') throw new Error('TELEGRAM_CHANNEL_ID должен указывать на Telegram-канал.');
  const membership = await telegram.getChatMember(config.telegramChannelId, me.id);
  if (!isChannelAdministrator(membership)) throw new Error('Бот должен быть администратором TELEGRAM_CHANNEL_ID.');
  console.log(JSON.stringify({
    status: 'ok',
    bot: { id: me.id, username: me.username },
    channel: { id: config.telegramChannelId, type: channel?.type ?? 'unknown', title: channel?.title ?? null },
    botMembership: membership.status,
    adminIdsConfigured: config.telegramAdminIds.size,
    webhook: {
      configured: Boolean(webhook?.url),
      pendingUpdateCount: Number.isSafeInteger(webhook?.pending_update_count) ? webhook.pending_update_count : 0,
      allowedUpdates: Array.isArray(webhook?.allowed_updates) ? webhook.allowed_updates : [],
      lastErrorDatePresent: Boolean(webhook?.last_error_date),
    },
  }, null, 2));
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
    allowed_updates: ['channel_post', 'edited_channel_post', 'message'],
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
