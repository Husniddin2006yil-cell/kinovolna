import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

type PlayerEvent = { data: number };
type ApiPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};
export type YouTubeControls = Pick<ApiPlayer, 'playVideo' | 'pauseVideo'> & { seek: (seconds: number) => void };
type PlayerConstructor = new (element: HTMLElement, options: {
  events: { onReady: () => void; onError: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void; onAutoplayBlocked: () => void };
}) => ApiPlayer;

declare global {
  interface Window {
    YT?: { Player: PlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<void> | null = null;
function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const fail = (message: string) => {
      window.clearTimeout(timeout);
      script.remove();
      window.onYouTubeIframeAPIReady = previousReady;
      iframeApiPromise = null;
      reject(new Error(message));
    };
    const timeout = window.setTimeout(() => fail('Плеер YouTube не загрузился. Проверьте соединение или откройте ролик на YouTube.'), 15_000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previousReady?.();
      resolve();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => fail('Не удалось загрузить официальный плеер YouTube.');
    document.head.appendChild(script);
  });
  return iframeApiPromise;
}

const playerErrorText: Record<number, string> = {
  2: 'YouTube отклонил идентификатор видео.',
  5: 'Видео не поддерживается в этом HTML5-плеере.',
  100: 'Видео удалено, закрыто или недоступно.',
  101: 'Автор запретил встраивание. Выберите другой результат или откройте YouTube.',
  150: 'Автор запретил встраивание. Выберите другой результат или откройте YouTube.',
  153: 'YouTube не получил идентификацию сайта. Telegram WebView может ограничивать Referer; откройте ролик на YouTube.',
};

type Props = {
  videoId: string;
  title: string;
  startSeconds?: number;
  autoplay: boolean;
  permitted: boolean;
  onState: (playing: boolean) => void;
  onProgress: (position: number, duration: number) => void;
};

export const YouTubePlayer = forwardRef<YouTubeControls, Props>(function YouTubePlayer(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ApiPlayer | null>(null);
  const readyRef = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useImperativeHandle(ref, () => ({
    playVideo: () => { if (readyRef.current && latest.current.permitted) { setBlocked(false); playerRef.current?.playVideo(); } },
    pauseVideo: () => { if (readyRef.current) playerRef.current?.pauseVideo(); },
    seek: (seconds) => { if (readyRef.current) playerRef.current?.seekTo(seconds, true); },
  }), []);

  // Only the component's lifetime owns the iframe, never a route, modal or song ID.
  useEffect(() => {
    let cancelled = false;
    const cue = () => {
      const current = latest.current;
      const options = { videoId: current.videoId, startSeconds: current.startSeconds || 0 };
      if (current.autoplay && current.permitted) playerRef.current?.loadVideoById(options);
      else playerRef.current?.cueVideoById(options);
    };
    void loadIframeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      const iframe = document.createElement('iframe');
      const url = new URL(`https://www.youtube.com/embed/${latest.current.videoId}`);
      url.search = new URLSearchParams({ enablejsapi: '1', playsinline: '1', controls: '1', rel: '0', origin: window.location.origin }).toString();
      // Set identity policy before navigation, not after the iframe's request.
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.title = 'YouTube — официальный плеер';
      iframe.src = url.href;
      hostRef.current.replaceChildren(iframe);
      playerRef.current = new window.YT.Player(iframe, { events: {
        onReady: () => { if (!cancelled) { readyRef.current = true; cue(); } },
        onStateChange: (event) => {
          if (cancelled) return;
          if (event.data === 1 && !latest.current.permitted) { playerRef.current?.pauseVideo(); return; }
          latest.current.onState(event.data === 1);
          if (event.data === 1) setBlocked(false);
        },
        onError: (event) => { if (!cancelled) { setError(playerErrorText[event.data] ?? 'YouTube не смог воспроизвести видео. Выберите другой результат.'); latest.current.onState(false); } },
        onAutoplayBlocked: () => { if (!cancelled) { setBlocked(true); latest.current.onState(false); } },
      } });
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось открыть YouTube.'); });
    const timer = window.setInterval(() => {
      if (readyRef.current && playerRef.current) latest.current.onProgress(playerRef.current.getCurrentTime(), playerRef.current.getDuration());
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setBlocked(false);
    if (!readyRef.current) return;
    const options = { videoId: props.videoId, startSeconds: props.startSeconds || 0 };
    if (props.autoplay && props.permitted) playerRef.current?.loadVideoById(options);
    else playerRef.current?.cueVideoById(options);
    // Playback state/position updates must not reload a song.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.videoId]);

  useEffect(() => { if (!props.permitted && readyRef.current) playerRef.current?.pauseVideo(); }, [props.permitted]);

  return <div className="youtube-player-block">
    <div className="youtube-player-frame" aria-label={`YouTube: ${props.title}`}><div className="youtube-player-host" ref={hostRef} /></div>
    {blocked && <p className="playback-message" role="status">Нажмите Play в плеере: браузер запретил автоматический запуск.</p>}
    {error && <div className="playback-message" role="alert">{error} <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(props.videoId)}`} target="_blank" rel="noopener">Открыть на YouTube</a></div>}
  </div>;
});
