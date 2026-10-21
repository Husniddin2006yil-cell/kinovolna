import 'dotenv/config';
import { Pool } from 'pg';
import { readConfig } from '../server/config.mjs';
import { migrate } from '../server/db.mjs';

const config = readConfig();
if (!config.databaseConfigured) {
  console.error('Для db:migrate требуется DATABASE_URL.');
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await migrate(pool);
    console.log('Миграции PostgreSQL выполнены.');
  } catch {
    console.error('Не удалось выполнить миграции PostgreSQL. Проверьте подключение и права доступа.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
