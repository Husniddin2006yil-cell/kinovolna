import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from 'lucide-react';
import type { Track } from '../data';
import { getTelegramWebApp } from '../telegram';

type Props = {
  track: Track | null;
  queue: Track[];
  playRequest: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  onTrackChange: (track: Track) => void;
};
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
function readSavedPosition(): { id: string; position: number } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem('kinovolna:playback') || 'null');
    return saved && typeof saved.id === 'string' && Number.isFinite(saved.position) && saved.position >= 0 ? saved : null;
  } catch { return null; }
}

export function MusicPlayer({ track, queue, playRequest, open, onOpen, onTrackChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [savedPosition] = useState(readSavedPosition);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [message, setMessage] = useState('');
  const sourceKey = track ? `${track.id}:${track.audioUrl ?? ''}` : '';
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;
  const latest = useRef({ track, position, playing });
  latest.current = { track, position, playing };
  const index = track ? queue.findIndex((item) => item.id === track.id) : -1;
  const canPrevious = index > 0;
  const canNext = index >= 0 && index < queue.length - 1;

  const savePosition = useCallback(() => {
    const current = latest.current;
    if (!current.track) return;
    try { sessionStorage.setItem('kinovolna:playback', JSON.stringify({ id: current.track.id, position: current.position, playing: current.playing })); } catch { /* Optional in a WebView. */ }
  }, []);

  useEffect(() => {
    const app = getTelegramWebApp();
    const visibility = () => {
      if (document.hidden || app?.isActive === false) audioRef.current?.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    app?.onEvent?.('activated', visibility);
    app?.onEvent?.('deactivated', visibility);
    window.addEventListener('pagehide', savePosition);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      app?.offEvent?.('activated', visibility);
      app?.offEvent?.('deactivated', visibility);
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
    const saved = savedPosition;
    setPosition(saved && saved.id === track?.id ? saved.position : 0);
    setDuration(0);
    setMessage('');
    if (!track?.audioUrl) audioRef.current?.pause();
  }, [track?.id]);

  useEffect(() => {
    if (track?.audioUrl) playAudio(sourceKey);
  }, [playRequest, track?.audioUrl, playAudio, sourceKey]);

  useEffect(() => { savePosition(); }, [position, playing, savePosition]);

  const restoreAudioPosition = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const saved = savedPosition;
    if (saved && saved.id === track?.id && saved.position > 0 && saved.position < audio.duration) audio.currentTime = saved.position;
  };

  const toggle = () => {
    if (!track?.audioUrl) {
      setMessage('Bu natija audio-only oqim bermaydi. Audio uchun Deezer preview yoki Open archive trekini tanlang.');
      return;
    }
    if (playing) audioRef.current?.pause();
    else playAudio(sourceKey);
  };
  const selectNeighbour = (direction: -1 | 1) => {
    const next = queue[index + direction];
    if (next?.audioUrl) onTrackChange(next);
  };
  const seek = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setPosition(seconds);
  };

  return <section className={`persistent-player ${open ? 'player-expanded' : ''}`} aria-label="Audio music player">
    <div className="player-detail">
      {open && <div className="player-detail-heading"><strong>{track?.title ?? 'Выберите трек'}</strong><button className="icon-button" onClick={() => onOpen(false)} aria-label="Свернуть плеер"><X size={18} /></button></div>}
      <audio ref={audioRef} className="real-audio-preview" controls preload="none" src={track?.audioUrl || undefined}
        onPlay={() => { if (sourceKeyRef.current === sourceKey) setPlaying(true); }} onPause={() => { if (sourceKeyRef.current === sourceKey) setPlaying(false); }} onEnded={() => { if (sourceKeyRef.current === sourceKey) setPlaying(false); }}
        onTimeUpdate={() => { if (sourceKeyRef.current === sourceKey) setPosition(audioRef.current?.currentTime || 0); }} onLoadedMetadata={restoreAudioPosition}
        onError={() => { if (sourceKeyRef.current === sourceKey && track?.audioUrl) { setPlaying(false); setMessage('Аудиоисточник недоступен. Выберите другой трек или откройте страницу источника.'); } }} />
      {open && <div className="player-controls audio-only-controls">
        <button className="icon-button" onClick={() => selectNeighbour(-1)} disabled={!canPrevious} aria-label="Предыдущий трек"><ChevronLeft size={19} /></button>
        <button className="player-main-control" onClick={toggle} disabled={!track?.audioUrl} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button className="icon-button" onClick={() => selectNeighbour(1)} disabled={!canNext} aria-label="Следующий трек"><ChevronRight size={19} /></button>
      </div>}
      {open && <p className="player-source-note">{track?.source === 'deezer' ? 'Deezer · 30-секундный preview.' : track?.source === 'commons' ? 'Open archive · Public Domain Mark 1.0.' : track ? 'Только разрешённый audio stream.' : 'Выберите песню на странице «Музыка».'} {track?.sourceUrl && <a href={track.sourceUrl} target="_blank" rel="noopener">Источник</a>}</p>}
      {open && duration > 0 && <label className="persistent-timeline"><span>{time(position)}</span><input type="range" min="0" max={duration} step="1" value={Math.min(position, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Позиция воспроизведения" /><span>{time(duration)}</span></label>}
    </div>
    {message && <p className="playback-message" role="status">{message}</p>}
    <div className="mini-player">
      <button className={`mini-art ${track?.coverStyle ?? ''}`} onClick={() => onOpen(!open)} aria-label="Открыть плеер"><AudioLines size={17} /></button>
      <button className="mini-info" onClick={() => onOpen(true)}><strong>{track?.title ?? 'Выберите музыку'}</strong><span>{track ? `${track.artist} · ${track.source === 'deezer' ? 'Deezer · 30 сек.' : track.tone}` : 'Выберите песню для прослушивания'}</span></button>
      <div className="mini-progress" aria-label={`Прослушано ${time(position)}`}><span style={{ width: `${duration ? Math.min(100, position / duration * 100) : 0}%` }} /></div>
      <button className="mini-play" onClick={toggle} disabled={!track?.audioUrl} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <button className="mini-expand" onClick={() => onOpen(!open)} aria-label="Вернуться к плееру"><Maximize2 size={16} /></button>
    </div>
  </section>;
}
