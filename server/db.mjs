/** Applies additive, idempotent PostgreSQL schema migrations. */
export async function migrate(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('A pg Pool is required for migrations');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(184293047)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS films (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        channel_id bigint NOT NULL,
        message_id bigint NOT NULL,
        channel_username text,
        source_date timestamptz,
        last_update_id bigint NOT NULL DEFAULT 0,
        year integer NOT NULL DEFAULT 0,
        genre text NOT NULL DEFAULT 'Не указан',
        kind text NOT NULL DEFAULT 'Фильм' CHECK (kind IN ('Фильм', 'Сериал')),
        poster text NOT NULL DEFAULT '/favicon.svg',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT films_channel_message_unique UNIQUE (channel_id, message_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_updates (
        update_id bigint PRIMARY KEY,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS video_file_id text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS video_file_size bigint');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS video_mime_type text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS video_duration integer');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tmdb_catalog (
        tmdb_id integer NOT NULL,
        media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
        title text NOT NULL,
        original_title text NOT NULL DEFAULT '',
        description text NOT NULL DEFAULT '',
        year integer NOT NULL DEFAULT 0,
        rating numeric(3,1) NOT NULL DEFAULT 0,
        genre text NOT NULL DEFAULT 'Не указан',
        poster text,
        backdrop text,
        source_url text NOT NULL,
        synced_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tmdb_id, media_type)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS films_title_search_idx ON films USING gin (to_tsvector(\'simple\', title || \' \' || description))');
    await client.query('CREATE INDEX IF NOT EXISTS films_source_date_idx ON films (source_date DESC NULLS LAST, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS tmdb_catalog_rating_idx ON tmdb_catalog (rating DESC, year DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS tmdb_catalog_title_idx ON tmdb_catalog (title)');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
