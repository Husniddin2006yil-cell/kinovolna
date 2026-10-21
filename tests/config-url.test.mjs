import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/config.mjs';

const blockedUrls = [
  'http://kinovolna.app',
  'https://localhost:3000',
  'https://127.0.0.1:8443',
  'https://10.0.0.5',
  'https://192.168.1.20',
  'https://app.example.com',
  'https://preview.us5.manus.computer',
];

test('production webhook and Mini App URLs reject local, placeholder, preview, and private hosts', () => {
  for (const value of blockedUrls) {
    const config = readConfig({ PUBLIC_BASE_URL: value, MINI_APP_URL: value });
    assert.equal(config.publicBaseUrl, null, `PUBLIC_BASE_URL should reject ${value}`);
    assert.equal(config.miniAppUrl, null, `MINI_APP_URL should reject ${value}`);
  }
});

test('public HTTPS production URLs are preserved for webhook and Mini App configuration', () => {
  const config = readConfig({
    PUBLIC_BASE_URL: 'https://api.kinovolna.app/',
    MINI_APP_URL: 'https://kinovolna.app/mini-app',
  });
  assert.equal(config.publicBaseUrl, 'https://api.kinovolna.app/');
  assert.equal(config.miniAppUrl, 'https://kinovolna.app/mini-app');
});
