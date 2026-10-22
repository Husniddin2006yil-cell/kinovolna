import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from 'lucide-react';
import type { Track } from '../data';

type Props = {
  track: Track | null;
  queue: Track[];
  playRequest: number;
  pauseRequest: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  onTrackChange: (track: Track) => void;
  onPlaybackChange: (playing: boolean) => void;
  onTrackPlayed: (track: Track) => void;
};

const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

function readSavedPosition(): { id: string; position: number } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem('kinovolna:playback') || 'null');
    return saved && typeof saved.id === 'string' && Number.isFinite(saved.position) && saved.position >= 0 ? saved : null;
  } catch {
    return null;
  }
}

export function MusicPlayer({ track, queue, playRequest, pauseRequest, open, onOpen, onTrackChange, onPlaybackChange, onTrackPlayed }: Props) {
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
    try {
      sessionStorage.setItem('kinovolna:playback', JSON.stringify({ id: current.track.id, position: current.position, playing: current.playing }));
    } catch { /* Optional in a WebView. */ }
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', savePosition);
    return () => window.removeEventListener('pagehide', savePosition);
  }, [savePosition]);

  const playAudio = useCallback((expectedKey = sourceKey) => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    void audio.play().then(() => {
      if (sourceKeyRef.current === expectedKey) setMessage('');
    }).catch((error: unknown) => {
      if (sourceKeyRef.current !== expectedKey || (error instanceof DOMException && error.name === 'AbortError')) return;
      setPlaying(false);
      onPlaybackChange(false);
      setMessage('Не удалось запустить аудио. Проверьте соединение и нажмите Play ещё раз.');
    });
  }, [sourceKey, onPlaybackChange]);

  useEffect(() => {
    setPlaying(false);
    onPlaybackChange(false);
    const saved = savedPosition;
    setPosition(saved && saved.id === track?.id ? saved.position : 0);
    setDuration(0);
    setMessage('');
    if (!track?.audioUrl) audioRef.current?.pause();
  }, [track?.id, onPlaybackChange, savedPosition]);

  useEffect(() => {
    if (playRequest > 0 && track?.audioUrl) playAudio(sourceKey);
  }, [playRequest, track?.audioUrl, playAudio, sourceKey]);

  useEffect(() => {
    if (pauseRequest > 0) audioRef.current?.pause();
  }, [pauseRequest]);

  useEffect(() => { savePosition(); }, [position, playing, savePosition]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const next = Math.max(0, Math.min(seconds, audio.duration));
    audio.currentTime = next;
    setPosition(next);
  }, []);

  const selectNeighbour = useCallback((direction: -1 | 1) => {
    const next = queue[index + direction];
    if (next?.audioUrl) onTrackChange(next);
  }, [index, onTrackChange, queue]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const media = navigator.mediaSession;
    try {
      media.metadata = track && typeof MediaMetadata !== 'undefined'
        ? new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.thumbnailUrl ? [{ src: track.thumbnailUrl, sizes: '512x512' }] : [],
        })
        : null;
    } catch { /* Some embedded browsers expose only part of Media Session. */ }

    const handlers: Array<[MediaSessionAction, (() => void) | null]> = [
      ['play', track?.audioUrl ? () => playAudio(sourceKeyRef.current) : null],
      ['pause', () => audioRef.current?.pause()],
      ['previoustrack', canPrevious ? () => selectNeighbour(-1) : null],
      ['nexttrack', canNext ? () => selectNeighbour(1) : null],
    ];
    for (const [action, handler] of handlers) {
      try { media.setActionHandler(action, handler); } catch { /* Unsupported action in this browser. */ }
    }
    try {
      media.setActionHandler('seekto', (details) => {
        if (Number.isFinite(details.seekTime)) seek(details.seekTime as number);
      });
    } catch { /* Unsupported action in this browser. */ }
    try {
      media.setActionHandler('seekbackward', (details) => seek(latest.current.position - (details.seekOffset ?? 10)));
      media.setActionHandler('seekforward', (details) => seek(latest.current.position + (details.seekOffset ?? 10)));
    } catch { /* Unsupported action in this browser. */ }

    return () => {
      for (const [action] of handlers) {
        try { media.setActionHandler(action, null); } catch { /* Optional API. */ }
      }
      for (const action of ['seekto', 'seekbackward', 'seekforward'] as const) {
        try { media.setActionHandler(action, null); } catch { /* Optional API. */ }
      }
    };
  }, [track?.id, track?.title, track?.artist, track?.album, track?.thumbnailUrl, track?.audioUrl, canPrevious, canNext, playAudio, seek, selectNeighbour]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = !track ? 'none' : playing ? 'playing' : 'paused'; } catch { /* Optional API. */ }
  }, [track, playing]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: audioRef.current?.playbackRate ?? 1, position: Math.min(position, duration) });
    } catch { /* Optional API or stale metadata. */ }
  }, [duration, position]);

  const restoreAudioPosition = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const saved = savedPosition;
    if (saved && saved.id === track?.id && saved.position > 0 && Number.isFinite(audio.duration) && saved.position < audio.duration) {
      audio.currentTime = saved.position;
    }
  };

  const toggle = () => {
    if (!track?.audioUrl) {
      setMessage('Сначала выберите запись с доступным аудиофайлом.');
      return;
    }
    if (playing) audioRef.current?.pause();
    else playAudio(sourceKey);
  };

  return <section className={`persistent-player ${open ? 'player-expanded' : ''}`} aria-label="Музыкальный плеер">
    <div className="player-detail">
      {open && <div className="player-detail-heading"><strong>{track?.title ?? 'Выберите трек'}</strong><button className="icon-button" onClick={() => onOpen(false)} aria-label="Свернуть плеер"><X size={18} /></button></div>}
      <audio ref={audioRef} className="real-audio-preview" preload="metadata" src={track?.audioUrl || undefined} aria-hidden="true" tabIndex={-1}
        onPlay={() => {
          if (sourceKeyRef.current !== sourceKey) return;
          setPlaying(true);
          onPlaybackChange(true);
          if (track) onTrackPlayed(track);
        }}
        onPause={() => { if (sourceKeyRef.current === sourceKey) { setPlaying(false); onPlaybackChange(false); } }}
        onEnded={() => { if (sourceKeyRef.current === sourceKey) { setPlaying(false); onPlaybackChange(false); } }}
        onTimeUpdate={() => { if (sourceKeyRef.current === sourceKey) setPosition(audioRef.current?.currentTime || 0); }}
        onLoadedMetadata={restoreAudioPosition}
        onError={() => { if (sourceKeyRef.current === sourceKey && track?.audioUrl) { setPlaying(false); onPlaybackChange(false); setMessage('Аудиофайл недоступен. Откройте страницу источника или выберите другую запись.'); } }} />
      {open && <div className="player-controls audio-only-controls">
        <button className="icon-button" onClick={() => selectNeighbour(-1)} disabled={!canPrevious} aria-label="Предыдущая запись"><ChevronLeft size={19} /></button>
        <button className="player-main-control" onClick={toggle} disabled={!track?.audioUrl} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button className="icon-button" onClick={() => selectNeighbour(1)} disabled={!canNext} aria-label="Следующая запись"><ChevronRight size={19} /></button>
      </div>}
      {open && <p className="player-source-note">
        {track?.source === 'commons' ? `Wikimedia Commons · открытая аудиозапись · ${track.licenseName ?? track.tone}.` : track ? 'Разрешённый аудиофайл.' : 'Выберите запись на странице «Музыка».'}
        {' '}{track?.sourceUrl && <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer">Страница файла</a>}
        {track?.licenseUrl && <> · <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer">Условия лицензии</a></>}
      </p>}
      {open && duration > 0 && <label className="persistent-timeline"><span>{time(position)}</span><input type="range" min="0" max={duration} step="1" value={Math.min(position, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Позиция воспроизведения" /><span>{time(duration)}</span></label>}
    </div>
    {message && <p className="playback-message" role="status">{message}</p>}
    <div className="mini-player">
      <button className={`mini-art ${track?.coverStyle ?? ''}`} onClick={() => onOpen(!open)} aria-label="Открыть плеер">{track?.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" /> : <AudioLines size={17} />}</button>
      <button className="mini-info" onClick={() => onOpen(true)}><strong>{track?.title ?? 'Выберите музыку'}</strong><span>{track ? `${track.artist} · ${track.licenseName ?? track.tone}` : 'Выберите свободную аудиозапись'}</span></button>
      <div className="mini-progress" aria-label={`Прослушано ${time(position)}`}><span style={{ width: `${duration ? Math.min(100, position / duration * 100) : 0}%` }} /></div>
      <button className="mini-play" onClick={toggle} disabled={!track?.audioUrl} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <button className="mini-expand" onClick={() => onOpen(!open)} aria-label="Вернуться к плееру"><Maximize2 size={16} /></button>
    </div>
  </section>;
}
