import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readConfig } from '../../server/config.mjs';
import { createApp } from '../../server/app.mjs';
import { migrate } from '../../server/db.mjs';
import { signInitData, testEnvironment } from '../helpers.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('catalog and direct film lookup are scoped to the configured channel', { skip: !databaseUrl }, async (t) => {
  const schema = `kinovolna_test_${randomUUID().replaceAll('-', '')}`;
  const setup = new Pool({ connectionString: databaseUrl });
  await setup.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  await migrate(pool);
  const foreignId = randomUUID();
  await pool.query('INSERT INTO films (id,title,description,channel_id,message_id) VALUES ($1,$2,$3,$4,$5)', [foreignId, 'Not this channel', 'Private unrelated film', '-1009999999999', 10]);
  const telegram = { getChatMember: async () => ({ status: 'member' }) };
  const config = readConfig(testEnvironment({ DATABASE_URL: databaseUrl }));
  const server = createApp({ config, pool, telegram }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    await setup.end();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Telegram-Init-Data': signInitData() };
  const page = await (await fetch(`${base}/api/films`, { headers })).json();
  assert.deepEqual(page.items, []);
  assert.equal(page.pagination.total, 0);
  for (const suffix of ['', '/telegram', '/playback']) {
    const response = await fetch(`${base}/api/films/${foreignId}${suffix}`, { headers });
    assert.equal(response.status, 404);
  }
});
