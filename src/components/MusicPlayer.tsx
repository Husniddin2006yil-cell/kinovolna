import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Maximize2, Pause, Play, X } from 'lucide-react';
import type { Track } from '../data';
import { getTelegramWebApp } from '../telegram';
import { YouTubePlayer, type YouTubeControls } from './YouTubePlayer';

type Props = { track: Track | null; playRequest: number; open: boolean; onOpen: (open: boolean) => void; viewportHeight: number | null; covered: boolean };
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
function readSavedPosition(): { id: string; position: number } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem('kinovolna:playback') || 'null');
    return saved && typeof saved.id === 'string' && Number.isFinite(saved.position) && saved.position >= 0 ? saved : null;
  } catch { return null; }
}

export function MusicPlayer({ track, playRequest, open, onOpen, viewportHeight, covered }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeRef = useRef<YouTubeControls>(null);
  const [savedPosition] = useState(readSavedPosition);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(!document.hidden && getTelegramWebApp()?.isActive !== false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const isYoutube = Boolean(track?.youtubeVideoId);
  const sourceKey = track ? `${track.id}:${track.audioUrl ?? track.youtubeVideoId ?? ''}` : '';
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;
  // A 200px-high visible YouTube viewport plus navigation must fit; never hide playing video.
  const hasRoom = (viewportHeight ?? windowHeight) >= 460;
  const permitted = active && hasRoom && !covered;
  const latest = useRef({ track, position, playing });
  latest.current = { track, position, playing };
  const savePosition = useCallback(() => {
    const current = latest.current;
    if (!current.track) return;
    try { sessionStorage.setItem('kinovolna:playback', JSON.stringify({ id: current.track.id, position: current.position, playing: current.playing })); } catch { /* Storage is optional in a WebView. */ }
  }, []);

  useEffect(() => {
    const app = getTelegramWebApp();
    const visibility = () => setActive(!document.hidden && app?.isActive !== false);
    const resize = () => setWindowHeight(window.innerHeight);
    document.addEventListener('visibilitychange', visibility);
    app?.onEvent?.('activated', visibility);
    app?.onEvent?.('deactivated', visibility);
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', savePosition);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      app?.offEvent?.('activated', visibility);
      app?.offEvent?.('deactivated', visibility);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', savePosition);
    };
  }, [savePosition]);

  const playAudio = useCallback((expectedKey = sourceKey) => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    void audio.play().then(() => {
      if (sourceKeyRef.current === expectedKey) setMessage('');
    }).catch((error: unknown) => {
      if (sourceKeyRef.current !== expectedKey || (error instanceof DOMException && error.name === 'AbortError')) return;
      setPlaying(false);
      setMessage('Нажмите Play ещё раз. Браузер ограничил запуск аудио или источник недоступен.');
    });
  }, [sourceKey]);

  useEffect(() => {
    setPlaying(false);
    setPosition(savedPosition?.id === track?.id ? savedPosition?.position || 0 : 0);
    setDuration(0);
    setMessage('');
    if (isYoutube) audioRef.current?.pause();
    // Route and expanded/collapsed state are deliberately absent from these dependencies.
  }, [track?.id, isYoutube]);

  useEffect(() => {
    if (!track?.audioUrl) return;
    playAudio(sourceKey);
  }, [playRequest, track?.audioUrl, playAudio, sourceKey]);

  useEffect(() => {
    if (isYoutube && playRequest > 0 && permitted) youtubeRef.current?.playVideo();
  }, [playRequest, isYoutube]);

  useEffect(() => {
    if (isYoutube && !permitted) { youtubeRef.current?.pauseVideo(); setPlaying(false); }
  }, [isYoutube, permitted]);

  useEffect(() => { savePosition(); }, [position, playing, savePosition]);

  const restoreAudioPosition = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    if (savedPosition && savedPosition.id === track?.id && savedPosition.position > 0 && savedPosition.position < audio.duration) audio.currentTime = savedPosition.position;
  };

  const toggle = () => {
    if (!track?.audioUrl && !isYoutube) { onOpen(true); return; }
    if (isYoutube) {
      if (!permitted) { setMessage('YouTube требует видимый плеер. Закройте клавиатуру или другое окно и нажмите Play.'); return; }
      if (playing) youtubeRef.current?.pauseVideo();
      else youtubeRef.current?.playVideo();
    } else if (playing) audioRef.current?.pause();
      else playAudio(sourceKey);
  };

  const seek = (seconds: number) => {
    if (isYoutube) youtubeRef.current?.seek(seconds);
    else if (audioRef.current) audioRef.current.currentTime = seconds;
    setPosition(seconds);
  };

  return <section className={`persistent-player ${isYoutube && hasRoom ? 'has-youtube' : ''} ${open ? 'player-expanded' : ''}`} aria-label="Музыкальный плеер">
    <div className={`player-detail ${isYoutube && hasRoom ? 'detail-visible' : ''}`}>
      {open && <div className="player-detail-heading"><strong>{track?.title ?? 'Выберите трек'}</strong><button className="icon-button" onClick={() => onOpen(false)} aria-label="Свернуть плеер"><X size={18} /></button></div>}
      {isYoutube && track ? <div className={`persistent-youtube ${hasRoom ? '' : 'youtube-no-room'}`}>
        <YouTubePlayer ref={youtubeRef} videoId={track.youtubeVideoId!} title={track.title} startSeconds={savedPosition?.id === track.id ? savedPosition.position : 0} autoplay={playRequest > 0} permitted={permitted} onState={(nextPlaying) => { if (sourceKeyRef.current === sourceKey) setPlaying(nextPlaying); }} onProgress={(p, d) => { if (sourceKeyRef.current === sourceKey) { setPosition(Number.isFinite(p) ? p : 0); setDuration(Number.isFinite(d) ? d : 0); } }} />
      </div> : null}
      {/* This audio element is outside route content and never depends on panel visibility. */}
      <audio ref={audioRef} className="real-audio-preview" controls preload="none" src={track?.audioUrl || undefined}
        onPlay={() => { if (sourceKeyRef.current === sourceKey) setPlaying(true); }} onPause={() => { if (sourceKeyRef.current === sourceKey) setPlaying(false); }} onEnded={() => { if (sourceKeyRef.current === sourceKey) setPlaying(false); }}
        onTimeUpdate={() => { if (sourceKeyRef.current === sourceKey) setPosition(audioRef.current?.currentTime || 0); }} onLoadedMetadata={restoreAudioPosition}
        onError={() => { if (sourceKeyRef.current === sourceKey && track?.audioUrl) { setPlaying(false); setMessage('Аудиоисточник недоступен. Выберите другой трек или откройте страницу источника.'); } }} />
      {open && <p className="player-source-note">{isYoutube ? 'YouTube · официальный видимый плеер. При сворачивании приложения воспроизведение приостанавливается.' : track?.audioUrl ? (track.source === 'deezer' ? 'Deezer · только 30-секундный preview, не полная песня.' : `${track.artist} · ${track.tone}`) : 'Выберите песню на странице «Музыка».'} {track?.sourceUrl && <a href={track.sourceUrl} target="_blank" rel="noopener">Источник</a>}</p>}
      {open && duration > 0 && <label className="persistent-timeline"><span>{time(position)}</span><input type="range" min="0" max={duration} step="1" value={Math.min(position, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Позиция воспроизведения" /><span>{time(duration)}</span></label>}
    </div>
    {isYoutube && !hasRoom && <p className="player-source-note">YouTube на паузе: закройте клавиатуру, чтобы показать плеер.</p>}
    {message && <p className="playback-message" role="status">{message}</p>}
    <div className="mini-player">
      <button className={`mini-art ${track?.coverStyle ?? ''}`} onClick={() => onOpen(!open)} aria-label="Открыть плеер"><AudioLines size={17} /></button>
      <button className="mini-info" onClick={() => onOpen(true)}><strong>{track?.title ?? 'Выберите музыку'}</strong><span>{track ? `${track.artist} · ${isYoutube ? 'YouTube' : track.source === 'deezer' ? 'Deezer · 30 сек.' : track.tone}` : 'Выберите песню для прослушивания'}</span></button>
      <div className="mini-progress" aria-label={`Прослушано ${time(position)}`}><span style={{ width: `${duration ? Math.min(100, position / duration * 100) : 0}%` }} /></div>
      <button className="mini-play" onClick={toggle} disabled={!track?.audioUrl && !isYoutube} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <button className="mini-expand" onClick={() => onOpen(!open)} aria-label="Вернуться к плееру"><Maximize2 size={16} /></button>
    </div>
  </section>;
}
