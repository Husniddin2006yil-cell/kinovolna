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
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS poster_file_id text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS media_group_id text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS series_id uuid');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS season_number integer');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS episode_number integer');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS poster_source text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS poster_source_id text');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS poster_checked_at timestamptz');
    await client.query('ALTER TABLE films ADD COLUMN IF NOT EXISTS poster_confidence numeric(4,3)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS series (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        normalized_title text NOT NULL UNIQUE,
        year integer NOT NULL DEFAULT 0,
        description text NOT NULL DEFAULT '',
        poster text,
        poster_source text,
        poster_source_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id uuid PRIMARY KEY,
        series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        season_number integer NOT NULL CHECK (season_number >= 0),
        title text NOT NULL DEFAULT '',
        UNIQUE (series_id, season_number)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id uuid PRIMARY KEY,
        season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        film_id uuid NOT NULL UNIQUE REFERENCES films(id) ON DELETE CASCADE,
        episode_number integer NOT NULL CHECK (episode_number >= 1),
        title text NOT NULL DEFAULT '',
        UNIQUE (season_id, episode_number)
      )
    `);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'films_series_fk') THEN
        ALTER TABLE films ADD CONSTRAINT films_series_fk FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL NOT VALID;
      END IF;
    END $$`);
    await client.query('CREATE INDEX IF NOT EXISTS films_series_episode_idx ON films (series_id, season_number, episode_number)');
    await client.query('CREATE INDEX IF NOT EXISTS episodes_order_idx ON episodes (season_id, episode_number)');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS films_channel_media_group_unique ON films (channel_id, media_group_id) WHERE media_group_id IS NOT NULL');
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
    await client.query('ALTER TABLE tmdb_catalog ADD COLUMN IF NOT EXISTS popularity numeric NOT NULL DEFAULT 0');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_subscribers (
        user_id bigint PRIMARY KEY,
        chat_id bigint NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS films_title_search_idx ON films USING gin (to_tsvector(\'simple\', title || \' \' || description))');
    await client.query('CREATE INDEX IF NOT EXISTS films_source_date_idx ON films (source_date DESC NULLS LAST, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS tmdb_catalog_rating_idx ON tmdb_catalog (rating DESC, year DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS tmdb_catalog_title_idx ON tmdb_catalog (title)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_reset_once (
        reset_key text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const reset = await client.query(`
      INSERT INTO catalog_reset_once (reset_key)
      VALUES ('empty-mini-app-catalog-2026-10-22-v2')
      ON CONFLICT (reset_key) DO NOTHING
      RETURNING reset_key
    `);
    if (reset.rows[0]) {
      await client.query('DELETE FROM episodes');
      await client.query('DELETE FROM seasons');
      await client.query('DELETE FROM series');
      await client.query('DELETE FROM films');
      await client.query('DELETE FROM tmdb_catalog');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
