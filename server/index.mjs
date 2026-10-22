import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { readConfig } from './config.mjs';
import { createApp } from './app.mjs';
import { createTelegramClient } from './telegram.mjs';
import { migrate } from './db.mjs';
import { syncTmdbCatalog } from './tmdb.mjs';

export function createServerRuntime(env = process.env) {
  const config = readConfig(env);
  const pool = config.databaseConfigured ? new Pool({ connectionString: config.databaseUrl }) : null;
  if (pool) pool.on('error', () => console.error('Ошибка пула PostgreSQL.'));
  const telegram = config.telegramConfigured ? createTelegramClient(config.telegramBotToken) : null;
  return { config, pool, telegram, app: createApp({ config, pool, telegram }) };
}

function runTelegramSetupCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts/telegram-setup.mjs'), command], { env: process.env, stdio: 'inherit' });
    child.on('error', () => {
      console.warn(`[telegram-setup] ${command} could not be started; service remains online.`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export async function startServer() {
  const runtime = createServerRuntime();
  if (runtime.pool) {
    try {
      await migrate(runtime.pool);
      console.log('Миграции PostgreSQL выполнены.');
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'unknown';
      console.error(`Не удалось выполнить миграции PostgreSQL (код ${code}).`);
      await runtime.pool.end();
      throw error;
    }

    if (runtime.config.tmdbConfigured) {
      try {
        const { rows } = await runtime.pool.query('SELECT count(*)::int AS count FROM tmdb_catalog');
        if (Number(rows[0]?.count ?? 0) === 0) {
          const count = await syncTmdbCatalog(runtime.pool, runtime.config.tmdbApiKey);
          console.log(`Каталог TMDB загружен: ${count} записей.`);
        }
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'unknown';
        console.error(`Не удалось синхронизировать каталог TMDB (код ${code}); API продолжит работу.`);
      }
    }
  }
  const host = runtime.config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';
  const server = runtime.app.listen(runtime.config.port, host, () => {
    console.log(`API запущен: ${host}:${runtime.config.port}`);
    if (runtime.config.nodeEnv === 'production') {
      void (async () => {
        if (runtime.config.telegramConfigured && runtime.config.publicBaseUrl && runtime.config.telegramWebhookSecret) {
          const setupCode = await runTelegramSetupCommand('webhook-if-empty');
          if (setupCode !== 0) console.warn('[telegram-webhook] Safe setup did not change the existing webhook; service remains online.');
        }
        const checkCode = await runTelegramSetupCommand('check');
        if (checkCode !== 0) console.warn('[telegram-diagnostic] Read-only check failed; service remains online.');
      })();
    }
  });
  const shutdown = async () => {
    server.close();
    if (runtime.pool) await runtime.pool.end();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { ...runtime, server };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  startServer().catch(() => {
    console.error('Не удалось запустить сервер. Проверьте конфигурацию.');
    process.exitCode = 1;
  });
}
