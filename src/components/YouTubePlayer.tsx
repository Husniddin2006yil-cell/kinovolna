import { useEffect, useRef, useState } from 'react';

type PlayerError = { data: number };
type YouTubePlayerHandle = { destroy: () => void };
type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    width: string;
    height: string;
    videoId: string;
    playerVars: Record<string, string | number>;
    events: { onError: (event: PlayerError) => void };
  },
) => YouTubePlayerHandle;

declare global {
  interface Window {
    YT?: { Player: YouTubePlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      iframeApiPromise = null;
      reject(new Error('Требуемый встроенный плеер YouTube не загрузился.'));
    }, 15_000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      previousReady?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      iframeApiPromise = null;
      reject(new Error('Не удалось загрузить официальный плеер YouTube.'));
    };
    document.head.appendChild(script);
  });
  return iframeApiPromise;
}

const playerErrorText: Record<number, string> = {
  2: 'YouTube отклонил этот идентификатор видео.',
  5: 'Видео не поддерживается во встроенном HTML5-плеере.',
  100: 'Видео удалено, закрыто или больше недоступно.',
  101: 'Автор запретил воспроизведение этого видео во встроенном плеере.',
  150: 'Автор запретил воспроизведение этого видео во встроенном плеере.',
  153: 'YouTube не смог проверить источник встроенного плеера в этом окружении.',
};

export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void loadIframeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onError: (event) => setError(playerErrorText[event.data] ?? 'YouTube не смог воспроизвести это видео. Выберите другой результат.'),
        },
      });
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось открыть плеер YouTube.');
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div className="youtube-player-frame" aria-label={`YouTube: ${title}`}>
      <div className="youtube-player-host" ref={hostRef} />
      {error && (
        <div className="youtube-player-error" role="alert">
          <strong>Этот ролик не удалось встроенно воспроизвести</strong>
          <span>{error}</span>
          <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noreferrer">Открыть на YouTube</a>
          <small>Вернитесь к списку и выберите другой результат.</small>
        </div>
      )}
    </div>
  );
}
