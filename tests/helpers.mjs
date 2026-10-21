import { createHmac, randomBytes } from 'node:crypto';

// Test-only generated token; this is never a live Telegram credential.
export const testBotToken = `${100000 + Math.floor(Math.random() * 900000)}:${randomBytes(32).toString('base64url')}`;
export const testUser = { id: 424242, first_name: 'Test', username: 'kinovolna_test' };
export const testChannel = '-1001234567890';
export const testWebhookSecret = randomBytes(32).toString('hex');

export function signInitData({ token = testBotToken, user = testUser, authDate = Math.floor(Date.now() / 1000), fields = {} } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user), ...fields });
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

export function testEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'test', PORT: '3001', APP_ORIGIN: 'http://localhost:3000',
    TELEGRAM_BOT_TOKEN: testBotToken, TELEGRAM_BOT_USERNAME: 'kinovolna_test_bot',
    TELEGRAM_CHANNEL_ID: testChannel, TELEGRAM_ADMIN_IDS: String(testUser.id),
    TELEGRAM_WEBHOOK_SECRET: testWebhookSecret,
    TELEGRAM_INIT_DATA_MAX_AGE: '3600',
    DATABASE_URL: 'postgres://unused@localhost/unused', ...overrides,
  };
}
