import 'dotenv/config';
import { Pool } from 'pg';
import { readConfig } from '../server/config.mjs';
import { migrate } from '../server/db.mjs';
import { syncTmdbCatalog } from '../server/tmdb.mjs';

const config = readConfig();
if (!config.databaseConfigured || !config.tmdbConfigured) {
  console.log('TMDB sync skipped: DATABASE_URL yoki TMDB_API_KEY sozlanmagan.');
  process.exit(0);
}

const pool = new Pool({ connectionString: config.databaseUrl });
try {
  await migrate(pool);
  const count = await syncTmdbCatalog(pool, config.tmdbApiKey);
  console.log(`TMDB catalog synchronized: ${count} records.`);
} catch {
  console.error('TMDB catalog sync failed. Database and TMDB configuration were not changed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
