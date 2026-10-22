export class YouTubeApiError extends Error {
  constructor(status, code) {
    super(`YouTube Data API request failed (${status})`);
    this.status = status;
    this.code = code;
  }
}

export async function searchYoutubeMusic(query, apiKey, { fetchImpl = fetch, region = 'UZ' } = {}) {
  const normalized = typeof query === 'string' ? query.trim() : '';
  if (!normalized || normalized.length > 120) throw new TypeError('Invalid YouTube search query');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('YouTube API key is not configured');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', normalized);
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('regionCode', region);
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('videoSyndicated', 'true');
  url.searchParams.set('fields', 'items(id/videoId,snippet(title,channelTitle,thumbnails))');

  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.items)) {
    const apiReason = payload?.error?.errors?.[0]?.reason;
    const code = response.status === 403 && /quota/i.test(String(apiReason ?? payload?.error?.message ?? ''))
      ? 'youtube_quota_exceeded'
      : response.status === 403 ? 'youtube_access_denied' : 'youtube_search_failed';
    throw new YouTubeApiError(response.status || 502, code);
  }

  return payload.items.flatMap((item) => {
    const videoId = item?.id?.videoId;
    const snippet = item?.snippet;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)
      || typeof snippet?.title !== 'string' || typeof snippet?.channelTitle !== 'string') return [];
    const thumbnails = snippet.thumbnails && typeof snippet.thumbnails === 'object' ? snippet.thumbnails : {};
    const thumbnail = ['high', 'medium', 'default'].map((size) => thumbnails[size]?.url)
      .find((value) => typeof value === 'string' && /^https:\/\//.test(value));
    return [{
      id: `youtube-${videoId}`,
      videoId,
      title: snippet.title.slice(0, 300),
      artist: snippet.channelTitle.slice(0, 160),
      album: 'YouTube',
      duration: 'YouTube',
      thumbnailUrl: thumbnail || null,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'youtube',
    }];
  });
}
