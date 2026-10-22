function sanitizeDiagnosticText(value) {
  if (typeof value !== 'string' || !value) return null;
  return value
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[BOT_TOKEN_REDACTED]')
    .replace(/(api[_-]?token|secret[_-]?token|authorization|password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL_REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 400);
}

function isAdministrator(member) {
  return member?.status === 'creator' || member?.status === 'administrator';
}

function errorMessage(result) {
  return result.status === 'rejected' ? sanitizeDiagnosticText(result.reason?.message || 'Telegram API call failed') : null;
}

export async function getTelegramDiagnostics(config, telegram) {
  const expectedUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/+$/, '')}/api/telegram/webhook`
    : null;
  const diagnostics = {
    checkedAt: new Date().toISOString(),
    configured: Boolean(config.telegramConfigured && telegram),
    channelConfigured: Boolean(config.channelConfigured),
    webhookSecretConfigured: Boolean(config.telegramWebhookSecret),
    botApiReachable: false,
    botUsername: null,
    botIsChannelAdmin: null,
    botMembershipStatus: null,
    webhook: {
      configured: false,
      matchesExpectedUrl: expectedUrl ? false : null,
      pendingUpdateCount: null,
      allowedUpdates: [],
      lastErrorDate: null,
      lastErrorMessage: null,
    },
    errors: {},
  };

  if (!diagnostics.configured) {
    diagnostics.errors.configuration = 'Telegram bot is not configured in this runtime.';
    return diagnostics;
  }

  const [botResult, webhookResult] = await Promise.allSettled([
    telegram.getMe(),
    telegram.getWebhookInfo(),
  ]);

  if (botResult.status === 'fulfilled' && botResult.value?.id) {
    diagnostics.botApiReachable = true;
    diagnostics.botUsername = typeof botResult.value.username === 'string' ? botResult.value.username : null;
  } else {
    diagnostics.errors.getMe = errorMessage(botResult) || 'Telegram Bot API did not return a bot ID.';
  }

  if (webhookResult.status === 'fulfilled') {
    const info = webhookResult.value || {};
    diagnostics.webhook = {
      configured: Boolean(info.url),
      matchesExpectedUrl: expectedUrl ? info.url === expectedUrl : null,
      pendingUpdateCount: Number.isSafeInteger(info.pending_update_count) ? info.pending_update_count : 0,
      allowedUpdates: Array.isArray(info.allowed_updates) ? info.allowed_updates.filter((item) => typeof item === 'string').slice(0, 20) : [],
      lastErrorDate: Number.isSafeInteger(info.last_error_date) ? new Date(info.last_error_date * 1000).toISOString() : null,
      lastErrorMessage: sanitizeDiagnosticText(info.last_error_message),
    };
  } else {
    diagnostics.errors.getWebhookInfo = errorMessage(webhookResult) || 'Telegram did not return webhook status.';
  }

  if (config.channelConfigured && botResult.status === 'fulfilled' && botResult.value?.id) {
    const [channelResult, membershipResult] = await Promise.allSettled([
      telegram.getChat(config.telegramChannelId),
      telegram.getChatMember(config.telegramChannelId, botResult.value.id),
    ]);
    if (channelResult.status === 'fulfilled') {
      diagnostics.channelType = channelResult.value?.type || null;
    } else {
      diagnostics.errors.getChannel = errorMessage(channelResult);
    }
    if (membershipResult.status === 'fulfilled') {
      diagnostics.botMembershipStatus = membershipResult.value?.status || null;
      diagnostics.botIsChannelAdmin = isAdministrator(membershipResult.value);
    } else {
      diagnostics.errors.getChannelMembership = errorMessage(membershipResult);
    }
  }

  return diagnostics;
}

export const telegramDiagnosticsInternals = Object.freeze({ sanitizeDiagnosticText, isAdministrator });
