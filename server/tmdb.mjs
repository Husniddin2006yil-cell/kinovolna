const TMDB_API_ROOT = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_ROOT = 'https://image.tmdb.org/t/p/w1280';

function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function yearFrom(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})/) : null;
  return match ? Number(match[1]) : 0;
}

function titleFor(item, mediaType) {
  return String(mediaType === 'tv' ? item.name ?? '' : item.title ?? '').trim();
}

function normalizeItem(item, mediaType, genres) {
  const title = titleFor(item, mediaType);
  const genreNames = Array.isArray(item.genre_ids)
    ? item.genre_ids.map((id) => genres.get(Number(id))).filter(Boolean).slice(0, 2)
    : [];
  return {
    tmdbId: Number(item.id),
    mediaType,
    title,
    originalTitle: String(mediaType === 'tv' ? item.original_name ?? '' : item.original_title ?? '').trim(),
    description: typeof item.overview === 'string' ? item.overview.trim() : '',
    year: yearFrom(mediaType === 'tv' ? item.first_air_date : item.release_date),
    rating: Number.isFinite(Number(item.vote_average)) ? Math.max(0, Math.min(10, Number(item.vote_average))) : 0,
    genre: genreNames.join(' · ') || 'Не указан',
    poster: typeof item.poster_path === 'string' ? `${TMDB_IMAGE_ROOT}${item.poster_path}` : null,
    backdrop: typeof item.backdrop_path === 'string' ? `${TMDB_BACKDROP_ROOT}${item.backdrop_path}` : null,
    sourceUrl: `https://www.themoviedb.org/${mediaType === 'tv' ? 'tv' : 'movie'}/${Number(item.id)}`,
  };
}

async function tmdbGet(path, apiKey) {
  const url = new URL(`${TMDB_API_ROOT}${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'ru-RU');
  url.searchParams.set('include_adult', 'false');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success === false) throw new Error(`TMDB request failed (${response.status})`);
  return payload;
}

export async function fetchTmdbWatchProviders(apiKey, mediaType, tmdbId) {
  if (!['movie', 'tv'].includes(mediaType) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    throw new TypeError('Invalid TMDB watch-provider request');
  }
  return tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`, apiKey);
}

export async function fetchTmdbCatalog(apiKey) {
  if (!apiKey) throw new Error('TMDB API key is not configured');
  const [movieGenres, tvGenres, popularMovies, newMovies, popularSeries] = await Promise.all([
    tmdbGet('/genre/movie/list', apiKey),
    tmdbGet('/genre/tv/list', apiKey),
    tmdbGet('/movie/popular?page=1', apiKey),
    tmdbGet('/movie/now_playing?page=1', apiKey),
    tmdbGet('/tv/popular?page=1', apiKey),
  ]);
  const movieGenreMap = new Map((movieGenres.genres ?? []).map((genre) => [Number(genre.id), String(genre.name)]));
  const tvGenreMap = new Map((tvGenres.genres ?? []).map((genre) => [Number(genre.id), String(genre.name)]));
  const all = [
    ...(popularMovies.results ?? []).slice(0, 30).map((item) => normalizeItem(item, 'movie', movieGenreMap)),
    ...(newMovies.results ?? []).slice(0, 30).map((item) => normalizeItem(item, 'movie', movieGenreMap)),
    ...(popularSeries.results ?? []).slice(0, 30).map((item) => normalizeItem(item, 'tv', tvGenreMap)),
  ];
  const unique = new Map(all.filter((item) => Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0 && item.title).map((item) => [`${item.mediaType}:${item.tmdbId}`, item]));
  return [...unique.values()];
}

/** Resolve one channel title to a TMDB poster without accepting a weak match. */
export async function matchTmdbPoster(apiKey, title, year = 0, kind = 'Фильм') {
  if (!apiKey || typeof title !== 'string' || !title.trim()) throw new TypeError('A TMDB key and title are required');
  const mediaTypes = kind === 'Сериал' ? ['tv', 'movie'] : ['movie', 'tv'];
  const candidates = [];
  for (const mediaType of mediaTypes) {
    const payload = await tmdbGet(`/search/${mediaType}?query=${encodeURIComponent(title.trim())}${year ? `&year=${year}` : ''}&page=1`, apiKey);
    for (const item of payload.results ?? []) {
      if (!item?.poster_path) continue;
      const names = [titleFor(item, mediaType), mediaType === 'tv' ? item.original_name : item.original_title].map(normalizeTitle).filter(Boolean);
      const wanted = normalizeTitle(title);
      const exact = names.includes(wanted);
      const candidateYear = yearFrom(mediaType === 'tv' ? item.first_air_date : item.release_date);
      const yearScore = year && candidateYear ? (year === candidateYear ? 0.25 : Math.abs(year - candidateYear) <= 1 ? 0.12 : -0.2) : 0;
      const titleScore = exact ? 0.72 : names.some((name) => name.includes(wanted) || wanted.includes(name)) ? 0.48 : 0;
      candidates.push({ item, mediaType, score: titleScore + yearScore + Math.min(0.08, Number(item.vote_average || 0) / 100) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.55) return null;
  const normalized = normalizeItem(best.item, best.mediaType, new Map());
  return { ...normalized, confidence: Number(Math.min(0.999, best.score).toFixed(3)), source: 'tmdb' };
}

export async function syncTmdbCatalog(pool, apiKey) {
  const items = await fetchTmdbCatalog(apiKey);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(`
        INSERT INTO tmdb_catalog (tmdb_id, media_type, title, original_title, description, year, rating, genre, poster, backdrop, source_url, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        ON CONFLICT (tmdb_id, media_type) DO UPDATE SET
          title = EXCLUDED.title, original_title = EXCLUDED.original_title, description = EXCLUDED.description,
          year = EXCLUDED.year, rating = EXCLUDED.rating, genre = EXCLUDED.genre, poster = EXCLUDED.poster,
          backdrop = EXCLUDED.backdrop, source_url = EXCLUDED.source_url, synced_at = now()
      `, [item.tmdbId, item.mediaType, item.title, item.originalTitle, item.description, item.year, item.rating.toFixed(1), item.genre, item.poster, item.backdrop, item.sourceUrl]);
    }
    await client.query('COMMIT');
    return items.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
