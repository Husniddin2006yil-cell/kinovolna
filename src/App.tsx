import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Film,
  Headphones,
  Heart,
  Home,
  Info,
  Mic2,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import { films as demoFilms, generatedArt, type Film as FilmItem, type Track } from './data';
import { getPublicConfig, getTelegramWebApp, loadFilmDetail, loadNotificationPreference, loadTelegramCatalog, openFilmInTelegram, recognizeMusicSample, requestFilmPlayback, requestTmdbWatchProviders, searchCommonsAudio, searchTelegramFilms, setNotificationPreference, type TelegramUser } from './telegram';
import { MusicPlayer } from './components/MusicPlayer';
import { useAppViewport } from './useAppViewport';
import { openAudioTracks } from './open-audio';
import './integration.css';

type Section = 'home' | 'music' | 'movies' | 'search' | 'profile';
type Notice = { title: string; body: string; label?: string };

const navItems: { id: Section; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'music', label: 'Музыка', icon: Music2 },
  { id: 'movies', label: 'Кино', icon: Film },
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'profile', label: 'Профиль', icon: UserRound },
];

const filters = ['Всё', 'Популярное', 'Новинки', 'Фантастика', 'Драма', 'Триллер', 'Приключения'];
const moodWaves = [
  { id: 'love', title: 'Для любви', subtitle: 'Нежность и чувства', symbol: '♡', className: 'mood-love' },
  { id: 'road', title: 'В дороге', subtitle: 'Музыка для пути', symbol: '↗', className: 'mood-road' },
  { id: 'workout', title: 'Для тренировки', subtitle: 'Ритм и энергия', symbol: '↯', className: 'mood-workout' },
  { id: 'work', title: 'Для работы', subtitle: 'Фокус и концентрация', symbol: '◎', className: 'mood-focus' },
  { id: 'happy', title: 'Хорошее настроение', subtitle: 'Лёгкость и свет', symbol: '✦', className: 'mood-fresh' },
  { id: 'sad', title: 'Грустный вечер', subtitle: 'Тихие чувства', symbol: '…', className: 'mood-sad' },
];

function normalizeMovieTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueMovieTitles(items: FilmItem[]): FilmItem[] {
  const seen = new Set<string>();
  return items.filter((film) => {
    const key = normalizeMovieTitle(film.title) || film.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findTelegramFilmMatch(film: FilmItem, candidates: FilmItem[]): FilmItem | null {
  const titles = new Set([film.title, film.originalTitle].map(normalizeMovieTitle).filter(Boolean));
  return candidates.find((candidate) =>
    [candidate.title, candidate.originalTitle].some((title) => {
      const normalized = normalizeMovieTitle(title);
      return titles.has(normalized) || [...titles].some((wanted) => normalized.length >= 5 && wanted.length >= 5 && (normalized.includes(wanted) || wanted.includes(normalized)));
    })
    && (!film.year || !candidate.year || Math.abs(film.year - candidate.year) <= 1),
  ) ?? null;
}

function Logo() {
  return (
    <div className="brand-lockup" aria-label="КИНОВОЛНА">
      <span className="brand-mark"><span>К</span><i /></span>
      <span className="brand-word">КИНО<span>ВОЛНА</span></span>
    </div>
  );
}

function Tag({ children, bright = false }: { children: ReactNode; bright?: boolean }) {
  return <span className={`tag ${bright ? 'tag-bright' : ''}`}>{children}</span>;
}

function SectionHeading({ eyebrow, title, action, onAction }: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action && <button className="text-action" onClick={onAction}>{action}<ArrowRight size={15} /></button>}
    </div>
  );
}

function FilmCard({ film, onOpen, isFavorite, onFavorite }: {
  film: FilmItem;
  onOpen: () => void;
  isFavorite: boolean;
  onFavorite: () => void;
}) {
  const [isIgniting, setIsIgniting] = useState(false);
  const igniteTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (igniteTimer.current !== null) window.clearTimeout(igniteTimer.current);
  }, []);

  const openWithGlow = () => {
    if (igniteTimer.current !== null) window.clearTimeout(igniteTimer.current);
    setIsIgniting(true);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onOpen();
      return;
    }
    igniteTimer.current = window.setTimeout(() => {
      igniteTimer.current = null;
      onOpen();
    }, 680);
  };

  return (
    <article className={`film-card ${isIgniting ? 'film-card-igniting' : ''}`} aria-busy={isIgniting}>
      <button className="poster-button" onClick={openWithGlow} aria-label={`Подробнее: ${film.title}`}>
        <div className="poster-image-wrap">
          <img className="poster-image" src={film.poster} alt={`Обложка: ${film.title}`} loading="lazy" onError={(event) => { event.currentTarget.style.opacity = '0'; }} />
          <span className="poster-play"><Play size={17} fill="currentColor" /></span>
          <span className="poster-shade" />
        </div>
      </button>
      <div className="film-meta-row">
        <div className="film-meta-copy">
          <button className="film-title-button" onClick={openWithGlow}>{film.title}</button>
        </div>
        <button className={`icon-button favorite-button ${isFavorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
          <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    </article>
  );
}

function TrackRow({ track, index, isFavorite, isActive, isPlaying, onFavorite, onSelect, onArtist }: {
  track: Track;
  index: number;
  isFavorite: boolean;
  isActive: boolean;
  isPlaying: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  onArtist: () => void;
}) {
  return (
    <div className={`track-row ${isActive ? 'track-row-active' : ''}`}>
      <span className="track-rank">{String(index + 1).padStart(2, '0')}</span>
      <div className={`track-cover ${track.coverStyle}`}>{track.thumbnailUrl ? <img className="track-cover-image" src={track.thumbnailUrl} alt="" loading="lazy" /> : <AudioLines size={18} />}</div>
      <div className="track-info">
        <strong>{track.title}</strong>
        <span><button className="artist-inline" onClick={onArtist}>{track.artist}</button><i />{track.album}</span>
        {track.source === 'commons' && <small className="track-attribution">
          {track.sourceUrl && <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer">Страница источника</a>}
          {track.licenseName && track.licenseUrl && <> <i /> <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer">{track.licenseName}</a></>}
        </small>}
      </div>
      <span className="track-tone">{track.licenseName ?? track.tone}</span>
      <span className="track-duration">{track.duration}</span>
      <button className={`icon-button track-heart ${isFavorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={isFavorite ? 'Убрать трек из избранного' : 'Добавить трек в избранное'}>
        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button className="icon-button track-play" onClick={onSelect} aria-label={`${isPlaying ? 'Пауза' : 'Воспроизвести'}: ${track.title}`}>{isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
    </div>
  );
}

function EmptyState({ query, onReset }: { query?: string; onReset: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Search size={22} /></div>
      <h3>{query ? 'Ничего не найдено' : 'Пока здесь пусто'}</h3>
      <p>{query ? `По запросу «${query}» результатов нет. Попробуйте другое название или жанр.` : 'Сохранённый контент появится в этом разделе.'}</p>
      {query && <button className="button button-quiet" onClick={onReset}>Очистить поиск</button>}
    </div>
  );
}

const splashParticles = [
  { left: '14%', top: '24%', delay: '0ms' },
  { left: '25%', top: '72%', delay: '260ms' },
  { left: '37%', top: '18%', delay: '480ms' },
  { left: '53%', top: '82%', delay: '120ms' },
  { left: '69%', top: '26%', delay: '380ms' },
  { left: '82%', top: '67%', delay: '620ms' },
  { left: '91%', top: '38%', delay: '220ms' },
  { left: '8%', top: '54%', delay: '540ms' },
];

function SplashScreen({ onSkip, exiting }: { onSkip: () => void; exiting: boolean }) {
  return (
    <main className={`cinema-splash ${exiting ? 'splash-exiting' : ''}`} aria-label="КИНОВОЛНА">
      <div className="splash-atmosphere" aria-hidden="true">
        <span className="splash-beam splash-beam-one" />
        <span className="splash-beam splash-beam-two" />
        <span className="splash-beam splash-beam-three" />
        <span className="splash-horizon" />
        {splashParticles.map((particle, index) => (
          <span key={index} className="splash-particle" style={{ left: particle.left, top: particle.top, animationDelay: particle.delay }} />
        ))}
      </div>
      <div className="splash-content">
        <svg className="splash-symbol" viewBox="0 0 96 72" fill="none" aria-hidden="true">
          <path d="M7 43C20 43 20 23 33 23S46 49 59 49 72 30 89 30" />
          <path d="M7 54C20 54 20 34 33 34S46 60 59 60 72 41 89 41" />
          <circle cx="59" cy="49" r="3" />
        </svg>
        <div className="splash-wordmark" aria-label="КИНОВОЛНА">
          {Array.from('КИНОВОЛНА').map((letter, index) => (
            <span key={`${letter}-${index}`} className="splash-letter" style={{ animationDelay: `${index * 70}ms` }}>{letter}</span>
          ))}
        </div>
        <span className="splash-rule" />
        <p className="splash-tagline">МИР КИНО И МУЗЫКИ</p>
        <p className="splash-caption">ИСТОРИИ, КОТОРЫЕ ОСТАЮТСЯ С ВАМИ</p>
      </div>
      <span className="splash-corner-label">КИНО · МУЗЫКА · СЕРИАЛЫ</span>
      <button className="splash-skip" onClick={onSkip}>Пропустить <ArrowRight size={14} /></button>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <Info size={19} />
      <div><strong>Не удалось загрузить каталог</strong><span>Проверьте соединение и попробуйте ещё раз.</span></div>
      <button onClick={onRetry}>Повторить</button>
    </div>
  );
}

function App() {
  const [section, setSection] = useState<Section>('home');
  const [query, setQuery] = useState('');
  const viewportHeight = useAppViewport();
  const [playRequest, setPlayRequest] = useState(0);
  const [pauseRequest, setPauseRequest] = useState(0);
  const [musicQuery, setMusicQuery] = useState('');
  const [films, setFilms] = useState<FilmItem[]>([]);
  const [catalogMode, setCatalogMode] = useState<'loading' | 'telegram' | 'tmdb' | 'demo' | 'blocked'>('loading');
  const [catalogMessage, setCatalogMessage] = useState('');
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [filter, setFilter] = useState('Всё');
  const [musicMode, setMusicMode] = useState<'all' | 'favorites'>('all');
  const [selectedMusicMood, setSelectedMusicMood] = useState<string | null>(null);
  const [selectedFilm, setSelectedFilm] = useState<FilmItem | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(['echoes']);
  const [musicFavorites, setMusicFavorites] = useState<string[]>([]);
  const [musicTracks, setMusicTracks] = useState<Track[]>([]);
  const [musicSearchResults, setMusicSearchResults] = useState<Track[] | null>(null);
  const [musicSearchBusy, setMusicSearchBusy] = useState(false);
  const [musicSearchError, setMusicSearchError] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>(['neon', 'city']);
  const [recentTrackIds, setRecentTrackIds] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [recognitionBusy, setRecognitionBusy] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState<'checking' | 'available' | 'not-configured' | 'unknown'>('checking');
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isSplashLeaving, setIsSplashLeaving] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const reloadCatalog = useCallback(async () => {
    setCatalogMode('loading');
    setCatalogError(false);
    setSelectedFilm(null);
    setFilms([]);
    setTelegramUser(null);
    try {
      const result = await loadTelegramCatalog();
      setFilms(uniqueMovieTitles(result.films).filter((film) => film.kind === 'Фильм'));
      setTelegramUser(result.user);
      setCatalogMode(result.mode);
      setCatalogMessage(result.mode === 'tmdb'
        ? (result.films.length ? 'Каталог загружен из TMDB. Постер и описание получены от провайдера метаданных.' : 'Каталог TMDB пока пуст.')
        : (result.films.length ? 'Каталог объединяет TMDB-постеры и реальные публикации Telegram-канала.' : 'В базе пока нет публикаций. Опубликуйте фильм в канале после подключения webhook или импортируйте старые записи.'));
      if (result.startParam?.startsWith('film_')) {
        const film = result.films.find((item) => item.id === result.startParam!.slice(5));
        if (film) setSelectedFilm(film);
      }
    } catch (error) {
      setCatalogMode('blocked');
      setCatalogError(true);
      setCatalogMessage(error instanceof Error ? error.message : 'Не удалось загрузить каталог.');
    }
  }, []);

  useEffect(() => {
    getTelegramWebApp()?.ready?.();
    void reloadCatalog();
  }, [reloadCatalog]);

  useEffect(() => {
    let active = true;
    void getPublicConfig()
      .then((config) => { if (active) setRecognitionStatus(config.audioRecognitionConfigured ? 'available' : 'not-configured'); })
      .catch(() => { if (active) setRecognitionStatus('unknown'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!telegramUser) return;
    void loadNotificationPreference().then(setNotificationsEnabled).catch(() => setNotificationsEnabled(false));
  }, [telegramUser]);

  const toggleNotifications = async () => {
    if (notificationsBusy || !telegramUser) {
      if (!telegramUser) openUnavailable('Откройте КИНОВОЛНУ в Telegram', 'Чтобы включить уведомления, откройте Mini App КИНОВОЛНА через Telegram-бота.');
      return;
    }
    setNotificationsBusy(true);
    try {
      const enabled = await setNotificationPreference(!notificationsEnabled);
      setNotificationsEnabled(enabled);
      setNotice({
        title: enabled ? 'Уведомления включены' : 'Уведомления выключены',
        body: enabled ? 'Когда в канале появится новая публикация, бот пришлёт сообщение в ваш чат. Чтобы получать уведомления, сначала запустите бота командой /start.' : 'Новые сообщения о фильмах от бота приходить не будут.',
        label: 'Telegram-бот',
      });
    } catch (error) {
      openUnavailable('Не удалось включить уведомления', error instanceof Error ? error.message : 'Сначала запустите Telegram-бота командой /start.');
    } finally { setNotificationsBusy(false); }
  };

  const showDemoCatalog = () => {
    setFilms(demoFilms);
    setSelectedFilm(null);
    setTelegramUser(null);
    setCatalogMode('demo');
    setCatalogError(false);
    setCatalogMessage('Демонстрационный каталог: эти фильмы не связаны с вашим каналом. Реальные Telegram-ссылки и воспроизведение для них недоступны.');
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setIsSplashLeaving(true), reducedMotion ? 120 : 1950);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isSplashLeaving) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setIsSplashVisible(false), reducedMotion ? 50 : 340);
    return () => window.clearTimeout(timer);
  }, [isSplashLeaving]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('kinovolna:favorites');
      const savedHistory = window.localStorage.getItem('kinovolna:history');
      const savedMusicFavorites = window.localStorage.getItem('kinovolna:music-favorites');
      const savedMusicLibrary = window.localStorage.getItem('kinovolna:music-library');
      const savedRecentTracks = window.localStorage.getItem('kinovolna:music-history');
      if (saved) setFavorites(JSON.parse(saved) as string[]);
      if (savedHistory) setHistory(JSON.parse(savedHistory) as string[]);
      if (savedMusicFavorites) setMusicFavorites(JSON.parse(savedMusicFavorites) as string[]);
      if (savedMusicLibrary) setMusicTracks(JSON.parse(savedMusicLibrary) as Track[]);
      if (savedRecentTracks) setRecentTrackIds(JSON.parse(savedRecentTracks) as string[]);
    } catch {
      // Local storage is optional in Telegram's embedded browser.
    }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem('kinovolna:favorites', JSON.stringify(favorites)); } catch { /* optional */ }
  }, [favorites]);

  useEffect(() => {
    try { window.localStorage.setItem('kinovolna:history', JSON.stringify(history)); } catch { /* optional */ }
  }, [history]);

  useEffect(() => {
    try { window.localStorage.setItem('kinovolna:music-favorites', JSON.stringify(musicFavorites)); } catch { /* optional */ }
  }, [musicFavorites]);

  useEffect(() => {
    try { window.localStorage.setItem('kinovolna:music-library', JSON.stringify(musicTracks.slice(0, 150))); } catch { /* optional */ }
  }, [musicTracks]);

  useEffect(() => {
    try { window.localStorage.setItem('kinovolna:music-history', JSON.stringify(recentTrackIds)); } catch { /* optional */ }
  }, [recentTrackIds]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName ?? '')) {
        event.preventDefault();
        setSelectedFilm(null);
        setSection('search');
        // Keyboard shortcut opens the in-app page without triggering WebView focus/zoom.
      }
      if (event.key === 'Escape') {
        setNotice(null);
        setPlayerOpen(false);
        setSelectedFilm(null);
        setSelectedArtist(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filteredFilms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return films.filter((film) => {
      const matchesQuery = !normalized || [film.title, film.originalTitle, film.genre, film.description].some((value) => value.toLocaleLowerCase().includes(normalized));
      const matchesFilter = filter === 'Всё'
        || (filter === 'Популярное' && Number(film.rating) >= 8.1)
        || (filter === 'Новинки' && film.year >= 2025)
        || film.genre === filter;
      return matchesQuery && matchesFilter;
    });
  }, [films, filter, query]);

  const filteredTracks = useMemo(() => {
    const source = musicSearchResults ?? (musicMode === 'favorites' ? [...openAudioTracks, ...musicTracks] : openAudioTracks);
    const unique = [...new Map(source.map((track) => [track.id, track] as const)).values()];
    return unique.filter((track) => musicMode === 'all' || musicFavorites.includes(track.id));
  }, [musicSearchResults, musicFavorites, musicMode]);

  const musicQueue = useMemo(() => musicSearchResults ?? openAudioTracks, [musicSearchResults]);

  const goTo = (next: Section) => {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setSection(next);
    setSelectedFilm(null);
    setSelectedArtist(null);
    setFilter('Всё');
  };

  const toggleFilmFavorite = (id: string) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleMusicFavorite = (id: string) => {
    setMusicFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const openFilm = (film: FilmItem) => {
    setSelectedFilm(film);
    setSelectedArtist(null);
    setHistory((current) => [film.id, ...current.filter((id) => id !== film.id)].slice(0, 4));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (film.source === 'telegram') void loadFilmDetail(film.id).then((detail) => setSelectedFilm((current) => current?.id === film.id ? { ...current, ...detail } : current)).catch(() => undefined);
  };

  const openUnavailable = (title: string, body: string, label = 'Интеграция не подключена') => setNotice({ title, body, label });

  const handleTelegramAction = async (film: FilmItem) => {
    if (film.source !== 'telegram' && film.source !== 'tmdb') {
      openUnavailable('Это демонстрационный фильм', 'В демо-карточке нет публикации в Telegram-канале, поэтому бот не может отправить видео.', 'Демо · нет Telegram-публикации');
      return;
    }
    setTelegramBusy(true);
    try {
      let telegramFilm = film;
      if (film.source === 'tmdb') {
        const titleBase = film.title.split(/[:–—|]/)[0].trim();
        const titleWords = titleBase.split(/\s+/).filter(Boolean);
        const queries = [...new Set([
          film.title,
          titleBase,
          titleWords.slice(0, 3).join(' '),
          film.originalTitle,
        ].map((value) => value.trim()).filter((value) => value.length >= 3))];
        let match: FilmItem | null = null;
        for (const query of queries) {
          match = findTelegramFilmMatch(film, await searchTelegramFilms(query));
          if (match) break;
        }
        if (!match) {
          openUnavailable('Фильм не найден в Telegram-канале', 'В каталоге TMDB есть только карточка с метаданными. Чтобы бот отправил видео, соответствующая публикация должна быть в вашем Telegram-канале.', 'Нет публикации для отправки');
          return;
        }
        telegramFilm = match;
      }
      const result = await openFilmInTelegram(telegramFilm.id);
      if (!result.ok) openUnavailable('Не удалось открыть Telegram', result.message ?? 'Проверьте настройки бота и доступ к закрытому каналу.', 'Telegram · проверка доступа');
    } catch (error) {
      openUnavailable('Не удалось найти фильм в Telegram', error instanceof Error ? error.message : 'Откройте Mini App из Telegram и повторите попытку.', 'Telegram · проверьте вход');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleWatchAction = async (film: FilmItem) => {
    if (film.source === 'tmdb') {
      try {
        const availability = await requestTmdbWatchProviders(film.id, 'UZ');
        if (!availability.link || !availability.providers.length) {
          openUnavailable('Легальная площадка не найдена', `Для региона ${availability.region} TMDB / JustWatch сейчас не показывает сервис, где доступен этот фильм. КИНОВОЛНА не подменяет отсутствующий источник пиратской ссылкой.`, 'TMDB / JustWatch');
          return;
        }
        const url = new URL(availability.link);
        const webApp = getTelegramWebApp();
        if (webApp?.openLink) webApp.openLink(url.href);
        else window.location.assign(url.href);
      } catch (error) {
        openUnavailable('Не удалось найти легальный просмотр', error instanceof Error ? error.message : 'Попробуйте позже.', 'TMDB / JustWatch');
      }
      return;
    }
    if (film.source !== 'telegram') {
      openUnavailable('Источник онлайн-видео не подключён', 'Демо-карточка не содержит видео. Выберите фильм из реального каталога, чтобы проверить доступные официальные источники.', 'Нужен реальный видеосервис');
      return;
    }
    const result = await requestFilmPlayback(film.id);
    if (!result.ok) openUnavailable(result.reason === 'failed' ? 'Не удалось открыть просмотр' : 'Источник онлайн-видео не подключён', result.message ?? 'Пока разрешённый видеопоток не настроен, фиктивная ссылка не открывается.', result.reason === 'failed' ? 'Ошибка backend' : 'Нужно подключить видеосервис');
    else if (result.url) setVideoUrl(result.url);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSection('search');
    setSelectedFilm(null);
    setSelectedArtist(null);
    setFilter('Всё');
  };

  const runMusicSearch = async (term: string) => {
    const normalized = term.trim();
    if (normalized.length < 2) {
      setMusicSearchResults([]);
      setMusicSearchError('Введите минимум два символа для поиска.');
      return;
    }
    setMusicSearchBusy(true);
    setMusicSearchError(null);
    setMusicSearchResults([]);
    try {
      const results = await searchCommonsAudio(normalized);
      setMusicSearchResults(results);
      if (results.length) {
        setMusicTracks((current) => {
          const merged = new Map<string, Track>();
          for (const item of [...results, ...current]) merged.set(item.id, item);
          return [...merged.values()].slice(0, 150);
        });
      } else {
        setMusicSearchError('В открытом архиве нет подходящих записей с проверенной свободной лицензией и совместимым аудиоформатом. Попробуйте другие слова.');
      }
    } catch (error) {
      setMusicSearchError(error instanceof Error ? error.message : 'Свободный аудиоархив временно недоступен. Попробуйте позже.');
    } finally {
      setMusicSearchBusy(false);
    }
  };

  const submitMusicSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedArtist(null);
    void runMusicSearch(musicQuery);
  };

  const chooseTrack = (track: Track) => {
    if (!track.audioUrl) {
      openUnavailable('Аудиофайл недоступен', 'У этой записи нет прямого аудиофайла, поэтому плеер не подменяет его видео или внешней ссылкой.', 'Нет аудиоисточника');
      return;
    }
    if (activeTrack?.id === track.id && musicPlaying) {
      setPauseRequest((current) => current + 1);
      setPlayerOpen(true);
      return;
    }
    setActiveTrack(track);
    setPlayerOpen(false);
    setPlayRequest((current) => current + 1);
  };

  const recordTrackPlayed = (track: Track) => {
    setRecentTrackIds((current) => [track.id, ...current.filter((id) => id !== track.id)].slice(0, 5));
    setMusicTracks((current) => {
      const merged = new Map<string, Track>([[track.id, track]]);
      for (const item of current) if (!merged.has(item.id)) merged.set(item.id, item);
      return [...merged.values()].slice(0, 150);
    });
  };

  const handleMusicRecognition = async () => {
    if (recognitionBusy) return;
    if (recognitionStatus !== 'available') {
      openUnavailable('Распознавание не подключено', recognitionStatus === 'unknown' ? 'Не удалось проверить серверную настройку AudD. Сейчас доступен поиск свободных аудиозаписей в Wikimedia Commons.' : 'AudD пока не настроен на сервере. Сейчас доступен поиск свободных аудиозаписей в Wikimedia Commons.', 'Интеграция AudD');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      openUnavailable('Микрофон недоступен', 'Этот браузер или Telegram WebView не поддерживает запись с микрофона.', 'Нужна поддержка микрофона');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      setRecognitionBusy(true);
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      const sample = await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error('Не удалось записать аудио.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        recorder.start();
        window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 8000);
      });
      const result = await recognizeMusicSample(sample);
      if (!result.matched || !result.track) {
        openUnavailable('Песня не найдена', 'AudD обработал запись, но совпадение не найдено. Попробуйте записать фрагмент громче и ближе к источнику.', 'Нет совпадения');
      } else {
        const track = result.track;
        openUnavailable(track.title ?? 'Найден трек', `${track.artist ?? 'Исполнитель не указан'}${track.album ? ` · ${track.album}` : ''}${track.releaseDate ? ` · ${track.releaseDate}` : ''}${track.songLink ? `\n${track.songLink}` : ''}`, 'Результат AudD');
      }
    } catch (error) {
      openUnavailable('Распознавание не выполнено', error instanceof Error ? error.message : 'Не удалось обработать запись.', 'Ошибка сервиса');
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setRecognitionBusy(false);
    }
  };

  if (isSplashVisible) return <SplashScreen exiting={isSplashLeaving} onSkip={() => setIsSplashLeaving(true)} />;

  const renderFilmGrid = (items: FilmItem[]) => items.length ? (
    <div className="film-grid">
      {items.map((film) => (
        <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />
      ))}
    </div>
  ) : <EmptyState query={query} onReset={() => { setQuery(''); setFilter('Всё'); }} />;

  const renderFilmRail = (items: FilmItem[]) => (
    <div className="film-rail">
      {items.map((film) => (
        <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />
      ))}
    </div>
  );

  const renderTrackList = (list: Track[]) => list.length ? (
    <div className="track-list">
      {list.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          isFavorite={musicFavorites.includes(track.id)}
          isActive={activeTrack?.id === track.id}
          isPlaying={activeTrack?.id === track.id && musicPlaying}
          onFavorite={() => toggleMusicFavorite(track.id)}
          onSelect={() => chooseTrack(track)}
          onArtist={() => { setSelectedArtist(track.artist); setMusicMode('all'); setMusicQuery(track.artist); void runMusicSearch(track.artist); }}
        />
      ))}
    </div>
  ) : <EmptyState query={musicQuery || undefined} onReset={() => { setMusicQuery(''); setMusicMode('all'); setMusicSearchResults(null); setMusicSearchError(null); }} />;

  const renderHome = () => {
    const filmsOnly = films.filter((film) => film.kind === 'Фильм');
    const sortedByRating = [...filmsOnly].sort((a, b) => Number(b.rating) - Number(a.rating));
    const latestFilms = [...filmsOnly].sort((a, b) => b.year - a.year);

    return (
      <>
        {catalogMode === 'demo' ? (
        <section className="hero-card" style={{ backgroundImage: `linear-gradient(90deg, rgba(7,10,18,.98) 0%, rgba(7,10,18,.76) 35%, rgba(7,10,18,.12) 100%), linear-gradient(0deg, rgba(7,10,18,.5), transparent 52%), url("${generatedArt.hero}")` }}>
          <div className="hero-topline"><Tag bright><Sparkles size={12} /> Выбор недели</Tag><span className="hero-index">01 <i /> 04</span></div>
          <div className="hero-copy">
            <div className="hero-overline"><span className="overline-dot" /> КИНОВОЛНА · КАТАЛОГ-ПРИМЕР</div>
            <h1>Будущее<br />уже <em>близко.</em></h1>
            <p>Один сигнал из глубин космоса способен изменить всё.</p>
            <div className="hero-details"><span><Star size={14} fill="currentColor" /> 8.6</span><i />2026<i />Фантастика<i />2 ч 08 мин</div>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => openFilm(films[0])}><Play size={16} fill="currentColor" /> Подробнее</button>
              <button className="button button-glass" onClick={() => toggleFilmFavorite('orbit')}><Plus size={17} /> {favorites.includes('orbit') ? 'Сохранено' : 'В мой список'}</button>
            </div>
          </div>
          <div className="hero-caption"><span className="caption-line" /> Почувствуйте атмосферу кино</div>
        </section>
        ) : catalogMode === 'tmdb' && films[0] ? (
          <section className="hero-card channel-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(7,10,18,.98) 0%, rgba(7,10,18,.76) 35%, rgba(7,10,18,.16) 100%), url("${films[0].poster}")` }}>
            <div className="hero-copy">
              <Tag bright><Star size={13} fill="currentColor" /> Высокий рейтинг</Tag>
              <h1>{films[0].title}</h1>
              <p>{films[0].description || 'Рекомендованный фильм с высоким рейтингом по данным TMDB.'}</p>
              <div className="hero-details"><span><Star size={14} fill="currentColor" /> {films[0].rating}</span><i />{films[0].year || '—'}<i />{films[0].genre}</div>
              <button className="button button-primary" onClick={() => openFilm(films[0])}>Подробнее <ArrowRight size={16} /></button>
            </div>
            <div className="hero-caption"><span className="caption-line" /> {films[0].badge ?? 'Кино из TMDB'}</div>
          </section>
        ) : (
          <section className="hero-card channel-hero">
            <div className="hero-copy">
              <Tag bright><Film size={13} /> Каталог Telegram-канала</Tag>
              <h1>{films[0]?.title ?? 'Ваше кино.'}</h1>
              <p>{films[0]?.description || catalogMessage || 'Загружаем публикации вашего канала…'}</p>
              {films[0] && <button className="button button-primary" onClick={() => openFilm(films[0])}>Подробнее <ArrowRight size={16} /></button>}
            </div>
          </section>
        )}

        <section className="content-section home-rail-section rail-now">
          <SectionHeading eyebrow={catalogMode === 'demo' ? 'Демо-подборка' : 'TMDB · 200 фильмов'} title={catalogMode === 'demo' ? 'Сейчас смотрят' : 'Фильмы'} action="Весь каталог" onAction={() => goTo('movies')} />
          {renderFilmRail(sortedByRating.slice(0, 5))}
          <p className="home-demo-note">{catalogMode === 'demo' ? 'Демонстрационный каталог; реальные просмотры не учитываются.' : 'Рейтинг и популярность предоставлены TMDB.'}</p>
        </section>

        <section className="content-section home-rail-section rail-popular">
          <SectionHeading eyebrow={catalogMode === 'demo' ? 'Высокие оценки · пример' : 'Ваш каталог'} title={catalogMode === 'demo' ? 'Популярное' : 'Выбрать фильм'} action="Смотреть всё" onAction={() => goTo('movies')} />
          {renderFilmRail(sortedByRating.slice(0, 4))}
        </section>

        <section className="content-section home-rail-section rail-new">
          <SectionHeading eyebrow="Свежие истории" title="Новинки кино" action="В каталог" onAction={() => { goTo('movies'); setFilter('Новинки'); }} />
          {renderFilmRail(latestFilms.slice(0, 5))}
        </section>

        <section className="music-feature">
          <div className="feature-orb orb-one" /><div className="feature-orb orb-two" />
          <div className="music-feature-copy"><Tag><AudioLines size={13} /> Аудионастроение</Tag><h2>Огни города</h2><p>Спокойные ритмы для полуночного настроения. Найдите свой саундтрек.</p><button className="button button-glass" onClick={() => goTo('music')}>К музыке <ArrowRight size={15} /></button></div>
          <div className="feature-sound"><div className="sound-disc"><span /><i /></div><div className="sound-wave">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div></div>
        </section>
      </>
    );
  };
  const renderMovies = (searchPage = false) => (
    <section className="page-section">
      <div className="page-title-row"><div><div className="eyebrow">{searchPage ? 'Поиск и открытия' : 'Погрузитесь в мир кино'}</div><h1>{searchPage ? 'Что вы ищете?' : 'Фильмы'}</h1><p>{searchPage ? 'Ищите по названию, жанру или описанию.' : '200 фильмов с постерами TMDB.'}</p></div><div className="catalog-count"><span>{filteredFilms.length.toString().padStart(2, '0')}</span><small>фильмов</small></div></div>
      <form className="large-search" onSubmit={submitSearch}><Search size={18} /><input className="main-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название фильма или жанр..." aria-label="Найти фильм" /><kbd>/</kbd><button type="submit" aria-label="Искать"><ArrowRight size={18} /></button></form>
      <div className="catalog-toolbar"><div className="chip-row">{filters.map((item) => <button key={item} className={`filter-chip ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button" onClick={() => setFilter(filter === 'Новинки' ? 'Всё' : 'Новинки')}><SlidersHorizontal size={15} /> Сортировка <ChevronDown size={14} /></button></div>
      {catalogError && <ErrorState onRetry={() => void reloadCatalog()} />}
      <div className="result-label"><span>{searchPage ? 'Результаты поиска' : 'Каталог'}</span><span>{query ? `По запросу «${query}»` : 'Подборка КИНОВОЛНА'}</span></div>
      {renderFilmGrid(filteredFilms)}
    </section>
  );

  const renderMusic = () => {
    const knownTracks = [...new Map([...openAudioTracks, ...musicTracks].map((track) => [track.id, track] as const)).values()];
    const recentlyPlayedTracks = recentTrackIds.map((id) => knownTracks.find((track) => track.id === id)).filter((track): track is Track => Boolean(track));
    const displayTracks = filteredTracks;

    if (selectedArtist) {
      const artistTracks = (musicSearchResults ?? []).filter((track) => track.artist.toLocaleLowerCase().includes(selectedArtist.toLocaleLowerCase()));
      const isFollowed = followedArtists.includes(selectedArtist);
      return (
        <section className="page-section music-page artist-page">
          <button className="back-link" onClick={() => setSelectedArtist(null)}><ArrowLeft size={17} /> К музыке</button>
          <div className="artist-profile-hero"><div className="artist-avatar artist-avatar-large"><AudioLines size={31} /></div><div className="artist-profile-copy"><div className="eyebrow">ИСПОЛНИТЕЛЬ · WIKIMEDIA COMMONS</div><h1>{selectedArtist}</h1><p>Открытые аудиофайлы с указанными авторством и лицензией.</p><button className="button button-primary" onClick={() => setFollowedArtists((current) => isFollowed ? current.filter((name) => name !== selectedArtist) : [...current, selectedArtist])}><Plus size={16} /> {isFollowed ? 'Вы подписаны' : 'Подписаться'}</button></div></div>
          <div className="music-toolbar"><div><div className="eyebrow">Результаты открытого архива</div><h2>Записи исполнителя</h2></div><Tag>Лицензия указана в каждой строке</Tag></div>
          {musicSearchBusy && <p className="music-provider-note" role="status">Ищем записи этого исполнителя в Wikimedia Commons…</p>}
          {musicSearchError && <div className="music-search-error" role="alert">{musicSearchError}</div>}
          {renderTrackList(artistTracks)}
        </section>
      );
    }

    const moodQueries: Record<string, string> = {
      love: 'love song', road: 'road music', workout: 'energetic music', work: 'ambient instrumental', happy: 'happy music', sad: 'melancholy music',
    };

    return (
      <section className="page-section music-page">
        <div className="music-page-heading">
          <div><div className="eyebrow"><span className="overline-dot" /> WIKIMEDIA COMMONS · ОТКРЫТЫЕ ЛИЦЕНЗИИ</div><h1>Свободная<br /><em>музыка.</em></h1><p>Ищите аудиозаписи, которые можно прослушивать по указанной лицензии. Это открытый архив, а не каталог популярных коммерческих хитов.</p></div>
          <button className="button button-glass recognition-trigger" onClick={() => void handleMusicRecognition()} disabled={recognitionBusy || recognitionStatus !== 'available'}><Mic2 size={16} /> {recognitionBusy ? 'Слушаем фрагмент…' : recognitionStatus === 'available' ? 'Распознать песню' : recognitionStatus === 'checking' ? 'Проверяем сервис…' : recognitionStatus === 'not-configured' ? 'Распознавание не подключено' : 'Сервис недоступен'}</button>
        </div>

        <form className="large-search music-search" onSubmit={submitMusicSearch}>
          <Search size={18} />
          <input value={musicQuery} onChange={(event) => { setMusicQuery(event.target.value); setSelectedArtist(null); setMusicSearchResults(null); setMusicSearchError(null); }} placeholder="Название записи или исполнителя…" aria-label="Поиск свободной музыки" />
          <button type="submit" className="music-search-button" disabled={musicSearchBusy || musicQuery.trim().length < 2}>{musicSearchBusy ? 'Ищем…' : 'Найти'}</button>
        </form>
        <p className="music-provider-note">В выдачу попадают только прямые аудиофайлы в поддерживаемом браузером формате, с распознанным свободным статусом и ссылкой на автора и условия использования.</p>

        <div className="music-toolbar"><div><div className="eyebrow">Подбор по ключевым словам</div><h2>Музыкальные волны</h2></div><Tag>Поиск в открытом архиве</Tag></div>
        <div className="mood-grid">
          {moodWaves.map((mood, index) => (
            <button key={mood.id} className={`mood-card ${mood.className} ${selectedMusicMood === mood.id ? 'mood-card-active' : ''}`} aria-pressed={selectedMusicMood === mood.id} onClick={() => {
              const selected = selectedMusicMood === mood.id;
              setSelectedMusicMood(selected ? null : mood.id);
              setMusicMode('all');
              setSelectedArtist(null);
              const term = selected ? '' : moodQueries[mood.id];
              setMusicQuery(term);
              if (selected) { setMusicSearchResults(null); setMusicSearchError(null); }
              else void runMusicSearch(term);
            }}>
              <span className="mood-symbol">{mood.symbol}</span><span className="mood-name">{mood.title}</span><span className="mood-sub">{mood.subtitle}</span><span className="mood-arrow">{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <p className="music-provider-note">Настроение задаёт поисковые слова; это не автоматическая музыкальная классификация и не персональная рекомендация.</p>

        <div className="music-toolbar tracks-heading"><div><div className="eyebrow">Wikimedia Commons · свободные записи</div><h2>{musicSearchResults === null ? 'Аудиоархив' : 'Результаты поиска'}</h2></div><div className="music-list-filters"><button className={`filter-chip ${musicMode === 'all' ? 'active' : ''}`} onClick={() => setMusicMode('all')}>Все</button><button className={`filter-chip ${musicMode === 'favorites' ? 'active' : ''}`} onClick={() => setMusicMode('favorites')}>Избранное</button></div></div>
        <div className="music-list-toolbar"><span>{musicSearchResults === null ? 'Проверенные записи' : `Запрос: «${musicQuery}»`}</span><span>{musicSearchBusy ? 'Ищем…' : `${displayTracks.length} записей`}</span></div>
        {musicSearchBusy && <p className="music-provider-note" role="status">Ищем открытые аудиофайлы…</p>}
        {musicSearchError && <div className="music-search-error" role="alert">{musicSearchError}</div>}
        {renderTrackList(displayTracks)}

        <div className="recognition-note"><div className="recognition-icon"><Mic2 size={17} /></div><div><strong>Узнайте, что играет</strong><span>{recognitionStatus === 'available' ? 'Распознавание отправляет короткую запись на настроенный серверный сервис. Оно не означает, что найденную песню можно бесплатно воспроизводить.' : recognitionStatus === 'checking' ? 'Проверяем, подключён ли серверный сервис распознавания.' : recognitionStatus === 'not-configured' ? 'Сервис AudD не подключён. Микрофон не запрашивается; можно искать свободные записи в открытом архиве.' : 'Не удалось проверить серверный сервис. Распознавание пока недоступно; поиск аудиозаписей работает отдельно.'}</span></div><button onClick={() => void handleMusicRecognition()} disabled={recognitionBusy || recognitionStatus !== 'available'}>{recognitionBusy ? 'Слушаем…' : recognitionStatus === 'available' ? 'Распознать' : 'Недоступно'} <ChevronRight size={14} /></button></div>
        <div className="music-toolbar recent-music-toolbar"><div><div className="eyebrow">История устройства</div><h2>Недавно слушали</h2></div><Tag>Только после начала воспроизведения</Tag></div>
        {recentlyPlayedTracks.length ? renderTrackList(recentlyPlayedTracks) : <div className="recent-music-empty"><Headphones size={19} /><span>Здесь появится запись только после фактического запуска аудио.</span></div>}
        <p className="recent-music-note">Избранное и история хранятся локально на этом устройстве. Общий профиль и статистика прослушиваний потребуют backend-базу.</p>
      </section>
    );
  };

  const renderProfile = () => {
    const savedFilms = films.filter((film) => favorites.includes(film.id));
    const recentFilms = history.map((id) => films.find((film) => film.id === id)).filter((film): film is FilmItem => Boolean(film));
    const savedTracks = [...new Map([...openAudioTracks, ...musicTracks].map((track) => [track.id, track] as const)).values()].filter((track) => musicFavorites.includes(track.id));
    return (
      <section className="page-section profile-page">
        <div className="page-title-row"><div><div className="eyebrow">Личный раздел</div><h1>Ваш профиль</h1><p>Сохранённое и открытые карточки. Избранное хранится на этом устройстве.</p></div><button className="icon-button settings-button" onClick={() => openUnavailable('Профиль и настройки', 'Вход подтверждается сервером через Telegram initData. Избранное пока сохраняется локально, а не в аккаунте. Пароль Telegram не требуется.', 'Информация')} aria-label="Настройки"><Settings2 size={19} /></button></div>
        <div className="profile-card"><div className="profile-avatar"><span>{telegramUser?.first_name.slice(0, 2) ?? 'КВ'}</span><i /></div><div className="profile-main"><div className="profile-name">{telegramUser ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') : 'Гостевой профиль'} <Tag>{telegramUser ? 'Подпись проверена' : 'Не авторизован'}</Tag></div><span className="profile-muted"><ShieldCheck size={14} /> {telegramUser ? `Telegram ID: ${telegramUser.id}` : 'Откройте Mini App в Telegram для входа'}</span></div><button className="button button-glass profile-connect" onClick={() => void reloadCatalog()}>{telegramUser ? 'Обновить вход' : 'Проверить вход'} <ChevronRight size={14} /></button></div>
        <div className="profile-stats"><div><span>{favorites.length.toString().padStart(2, '0')}</span><small>Фильмов в избранном</small></div><div><span>{recentFilms.length.toString().padStart(2, '0')}</span><small>Открытых карточек</small></div><div><span>{musicFavorites.length.toString().padStart(2, '0')}</span><small>Треков сохранено</small></div></div>
        <section className="content-section profile-content"><SectionHeading eyebrow="Ваша история карточек" title="Недавно открывали" />{recentFilms.length ? <div className="film-grid">{recentFilms.map((film) => <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />)}</div> : <EmptyState onReset={() => goTo('movies')} />}</section>
        <section className="content-section profile-content"><SectionHeading eyebrow="Только для вас" title="Избранные фильмы" action="Открыть каталог" onAction={() => goTo('movies')} />{savedFilms.length ? <div className="film-grid">{savedFilms.map((film) => <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />)}</div> : <EmptyState onReset={() => goTo('movies')} />}</section>
        <section className="content-section profile-content"><SectionHeading eyebrow="Ваша музыка" title="Избранные треки" action="К музыке" onAction={() => goTo('music')} />{renderTrackList(savedTracks)}</section>
        <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Конфиденциальность прежде всего.</strong> Мы не спрашиваем пароль от Telegram. Приватный каталог доступен только после проверки подписи Mini App и членства в канале на сервере.</span></div>
      </section>
    );
  };

  const renderDetail = (film: FilmItem) => (
    <section className="detail-page">
      <button className="back-link" onClick={() => setSelectedFilm(null)}><ArrowLeft size={17} /> Назад</button>
      <div className="detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,12,14,.98) 0%, rgba(8,12,14,.76) 47%, rgba(8,12,14,.3) 100%), linear-gradient(0deg, rgba(8,12,14,.75), transparent 75%), url("${film.poster}")` }}>
        <div className="detail-content">
          <Tag bright>{film.kind === 'Сериал' ? 'Сериал' : film.genre}</Tag>
          <h1>{film.title}</h1>
          <div className="detail-facts"><span><Star size={14} fill="currentColor" /> {film.rating}</span><i />{film.year || 'Год не указан'}<i />{film.duration}<i />{film.genre}</div>
          <p>{film.description}</p>
          <div className="detail-actions">
            <button className="button button-primary" disabled={telegramBusy} onClick={() => void handleTelegramAction(film)}><ArrowRight size={16} /> {telegramBusy ? 'Ищем в Telegram…' : 'Отправить в бот'}</button>
            <button className={`icon-button detail-fav ${favorites.includes(film.id) ? 'is-favorite' : ''}`} onClick={() => toggleFilmFavorite(film.id)} aria-label="В избранное"><Heart size={18} fill={favorites.includes(film.id) ? 'currentColor' : 'none'} /></button>
          </div>
          <div className="rights-note"><Info size={14} /> Используются только источники, которые разрешено распространять.</div>
        </div>
      </div>
      {film.kind === 'Сериал' && (
        <section className="episodes-section">
          <div className="episode-heading">
            <div><div className="eyebrow">Сезоны и серии</div><h2>Серии</h2></div>
            <Tag>Доступно серий: {film.episodes?.length ?? 0}</Tag>
          </div>
          <div className="episode-list">
            {film.episodes?.map((episode, index) => {
              const item = typeof episode === 'string'
                ? { id: film.id, title: episode, season: 1, number: index + 1, available: false }
                : episode;
              return (
                <button
                  key={`${item.id}-${item.number}`}
                  className="episode-row"
                  onClick={() => item.available
                    ? void handleTelegramAction({ ...film, id: item.id, title: item.title })
                    : openUnavailable('Серия не найдена', 'Для этой серии нет связанного сообщения в Telegram или видеопотока.')}
                >
                  <span className="episode-number">S{item.season} · E{String(item.number).padStart(2, '0')}</span>
                  <span className="episode-play"><Play size={14} fill="currentColor" /></span>
                  <strong>{item.title}</strong>
                  <span className="episode-runtime">{item.available ? 'Доступна' : 'Не найдена'}</span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="detail-legal"><ShieldCheck size={16} /><span>{film.source === 'telegram' ? 'Карточка связана с публикацией канала. Защищённый просмотр доступен только для подходящих видеофайлов; большие файлы можно запросить через бота.' : film.source === 'tmdb' ? 'TMDB предоставляет метаданные. Доступность легальных сервисов проверяется через JustWatch; само видео открывается на выбранной площадке, если оно доступно в регионе UZ.' : 'Сейчас показан демонстрационный каталог без соответствующего поста в канале и без видеопотока.'}</span></div>
    </section>
  );

  const content = selectedFilm ? renderDetail(selectedFilm) : section === 'home' ? renderHome() : section === 'movies' ? renderMovies() : section === 'search' ? renderMovies(true) : section === 'music' ? renderMusic() : renderProfile();

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-home" onClick={() => goTo('home')}><Logo /></button>
        <nav className="desktop-nav" aria-label="Главная навигация">
          {navItems.filter((item) => item.id !== 'search').map(({ id, label }) => <button key={id} className={`nav-link ${section === id && !selectedFilm ? 'nav-link-active' : ''}`} onClick={() => goTo(id)}>{label}</button>)}
        </nav>
        <div className="topbar-actions">
          <form className="top-search" onSubmit={submitSearch}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск..." aria-label="Поиск по каталогу" /><kbd>/</kbd></form>
          <button className={`icon-button notification-button ${notificationsEnabled ? 'is-favorite' : ''}`} onClick={() => void toggleNotifications()} aria-label={notificationsEnabled ? 'Отключить уведомления' : 'Включить уведомления'} disabled={notificationsBusy}><Bell size={18} fill={notificationsEnabled ? 'currentColor' : 'none'} /><i /></button>
          <button className="top-avatar" onClick={() => goTo('profile')} aria-label="Открыть профиль"><span>КВ</span></button>
        </div>
      </header>
      <main className={`main-content ${selectedFilm ? 'main-detail' : ''}`}>
        {!selectedFilm && section !== 'home' && <div className="mobile-page-label"><Logo /><span>{section === 'music' ? 'Музыка' : section === 'movies' ? 'Кино' : section === 'search' ? 'Поиск' : 'Профиль'}</span></div>}
        <section className={`catalog-status catalog-status-${catalogMode}`} role="status" aria-live="polite">
          <div><strong>{catalogMode === 'loading' ? 'Загружаем каталог…' : catalogMode === 'telegram' ? 'Telegram-каталог' : catalogMode === 'tmdb' ? 'Каталог TMDB' : catalogMode === 'demo' ? 'Демо-режим' : 'Каталог не подключён'}</strong><p>{catalogMessage || 'Проверяем backend и источник каталога.'}</p></div>
          <div className="catalog-status-actions"><button className="button button-glass" disabled={catalogMode === 'loading'} onClick={() => void reloadCatalog()}>Обновить каталог</button>{!['telegram', 'tmdb', 'demo'].includes(catalogMode) && <button className="button button-glass" onClick={showDemoCatalog}>Посмотреть демо</button>}</div>
        </section>
        {content}
        <footer className="site-footer"><div><Logo /><span>Единое пространство фильмов и музыки.</span></div><span>© 2026 КИНОВОЛНА <i /> {catalogMode === 'telegram' ? 'Каталог Telegram · онлайн-видео не подключено' : catalogMode === 'tmdb' ? 'Метаданные TMDB · легальный видеопровайдер не подключён' : 'Для реального каталога нужна настройка источника'}</span></footer>
      </main>
      <MusicPlayer track={activeTrack} queue={musicQueue} playRequest={playRequest} pauseRequest={pauseRequest} open={playerOpen} onOpen={setPlayerOpen} onTrackChange={chooseTrack} onPlaybackChange={setMusicPlaying} onTrackPlayed={recordTrackPlayed} />
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`mobile-nav-item ${section === id && !selectedFilm ? 'mobile-nav-active' : ''}`} onClick={() => goTo(id)}><span className="mobile-icon-wrap"><Icon size={19} strokeWidth={section === id ? 2.3 : 1.8} /></span><span>{label}</span></button>)}
      </nav>
      {videoUrl && <div className="player-overlay" onClick={() => setVideoUrl(null)} role="presentation"><section className="player-modal video-modal" role="dialog" aria-modal="true" aria-label="Онлайн просмотр" onClick={(event) => event.stopPropagation()}><button className="player-close icon-button" onClick={() => setVideoUrl(null)} aria-label="Закрыть видео"><X size={19} /></button><Tag><Play size={13} fill="currentColor" /> КИНОВОЛНА · ОНЛАЙН</Tag><h2>{selectedFilm?.title ?? 'Видео'}</h2><video className="film-video" controls autoPlay playsInline src={videoUrl}>Ваш браузер не поддерживает видео.</video><p className="video-modal-note">Видеопоток отдается сервером через Telegram Bot API по временной защищённой ссылке.</p></section></div>}
      {notice && <div className="modal-backdrop" onClick={() => setNotice(null)} role="presentation"><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={() => setNotice(null)} aria-label="Закрыть"><X size={18} /></button><div className="modal-emblem"><Info size={20} /></div><span className="eyebrow">{notice.label ?? 'Информация'}</span><h2 id="notice-title">{notice.title}</h2><p>{notice.body}</p><button className="button button-primary modal-done" onClick={() => setNotice(null)}>Понятно <Check size={16} /></button></section></div>}
    </div>
  );
}

export default App;
