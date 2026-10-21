import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { testEnvironment, testWebhookSecret } from './helpers.mjs';

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('private API responses forbid intermediary/browser caching and vary by auth header', async (t) => {
  const base = await serve(t, createApp({ config: readConfig({}) }));
  for (const path of ['/api/config', '/api/films', '/api/unknown']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('vary'), /X-Telegram-Init-Data/i);
    assert.match(response.headers.get('vary'), /Origin/i);
  }
});

test('wrong webhook secret is rejected before malformed JSON or a large body is parsed', async (t) => {
  const config = readConfig(testEnvironment());
  const base = await serve(t, createApp({ config, pool: {}, telegram: {} }));
  const request = (body, secret) => fetch(`${base}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body });
  assert.equal((await request('{broken', 'wrong')).status, 401);
  assert.equal((await request('x'.repeat(1024 * 1024 + 1), 'wrong')).status, 401);
  assert.equal((await request('{broken', testWebhookSecret)).status, 400);
});

test('invalid webhook requests are limited while valid Telegram retries bypass the abuse limit', async (t) => {
  const base = await serve(t, createApp({ config: readConfig(testEnvironment()), pool: {}, telegram: {} }));
  let response;
  for (let n = 0; n < 31; n++) {
    response = await fetch(`${base}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' }, body: '{}' });
    await response.arrayBuffer();
  }
  assert.equal(response.status, 429);
  const validSecret = await fetch(`${base}/api/telegram/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': testWebhookSecret }, body: '{}' });
  assert.equal(validSecret.status, 400); // shape rejected, not rate limited
});

test('proxy trust is off by default and requires an explicit bounded configuration', () => {
  const plain = readConfig({});
  assert.equal(plain.trustProxyHops, 0);
  assert.equal(createApp({ config: plain }).get('trust proxy'), false);
  const trusted = readConfig({ TRUST_PROXY_HOPS: '1' });
  assert.equal(createApp({ config: trusted }).get('trust proxy'), 1);
  for (const value of ['true', '-1', '100', '*']) assert.equal(readConfig({ TRUST_PROXY_HOPS: value }).trustProxyHops, 0);
});
