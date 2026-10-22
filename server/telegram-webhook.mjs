export async function setTelegramWebhookOnlyIfEmpty(config, telegram) {
  if (!config?.telegramConfigured || !telegram) {
    throw new Error('Telegram bot is not configured.');
  }
  if (!config.publicBaseUrl || !config.telegramWebhookSecret) {
    throw new Error('A valid PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET are required.');
  }

  const target = `${config.publicBaseUrl.replace(/\/+$/, '')}/api/telegram/webhook`;
  const current = await telegram.getWebhookInfo();
  const currentUrl = typeof current?.url === 'string' ? current.url : '';

  if (currentUrl) {
    if (currentUrl === target) return { status: 'already_configured', changed: false };
    throw new Error('An existing Telegram webhook is configured; refusing to replace it.');
  }

  await telegram.setWebhook({
    url: target,
    secret_token: config.telegramWebhookSecret,
    allowed_updates: ['channel_post', 'edited_channel_post', 'message', 'callback_query'],
    drop_pending_updates: false,
  });
  return { status: 'configured', changed: true };
}
