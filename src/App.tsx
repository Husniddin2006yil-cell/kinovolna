import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Disc3,
  Film,
  Headphones,
  Heart,
  Home,
  Info,
  ListMusic,
  Maximize2,
  Mic2,
  Music2,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  Volume2,
  X,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { films, generatedArt, tracks, type Film as FilmItem, type Track } from './data';
import { openFilmInTelegram, requestFilmPlayback } from './telegram';

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
const playlists = [
  { title: 'Огни города', subtitle: 'Ночной плейлист', className: 'playlist-city', tracks: 18 },
  { title: 'Тихая волна', subtitle: 'Для спокойного дня', className: 'playlist-blue', tracks: 12 },
  { title: 'Новый маршрут', subtitle: 'В дорогу', className: 'playlist-road', tracks: 15 },
];
const moodWaves = [
  { id: 'love', title: 'Для любви', subtitle: 'Нежность и чувства', symbol: '♡', className: 'mood-love' },
  { id: 'road', title: 'В дороге', subtitle: 'Музыка для пути', symbol: '↗', className: 'mood-road' },
  { id: 'workout', title: 'Для тренировки', subtitle: 'Ритм и энергия', symbol: '↯', className: 'mood-workout' },
  { id: 'work', title: 'Для работы', subtitle: 'Фокус и концентрация', symbol: '◎', className: 'mood-focus' },
  { id: 'happy', title: 'Хорошее настроение', subtitle: 'Лёгкость и свет', symbol: '✦', className: 'mood-fresh' },
  { id: 'sad', title: 'Грустный вечер', subtitle: 'Тихие чувства', symbol: '…', className: 'mood-sad' },
];

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
  return (
    <article className="film-card">
      <button className="poster-button" onClick={onOpen} aria-label={`Подробнее: ${film.title}`}>
        <div className="poster-image-wrap">
          <img className="poster-image" src={film.poster} alt={`Обложка: ${film.title}`} loading="lazy" onError={(event) => { event.currentTarget.style.opacity = '0'; }} />
          {film.badge && <span className={`poster-badge ${['Новинка', 'Премьера'].includes(film.badge) ? 'poster-badge-mint' : ''}`}>{film.badge}</span>}
          <span className="poster-play"><Play size={17} fill="currentColor" /></span>
          <span className="poster-shade" />
          <span className="poster-rating"><Star size={12} fill="currentColor" /> {film.rating}</span>
        </div>
      </button>
      <div className="film-meta-row">
        <div className="film-meta-copy">
          <button className="film-title-button" onClick={onOpen}>{film.title}</button>
          <span>{film.year}<i />{film.genre}</span>
        </div>
        <button className={`icon-button favorite-button ${isFavorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
          <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    </article>
  );
}

function TrackRow({ track, index, isFavorite, onFavorite, onSelect, onArtist }: {
  track: Track;
  index: number;
  isFavorite: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  onArtist: () => void;
}) {
  return (
    <div className="track-row">
      <span className="track-rank">{String(index + 1).padStart(2, '0')}</span>
      <div className={`track-cover ${track.coverStyle}`}><AudioLines size={18} /></div>
      <div className="track-info">
        <strong>{track.title}</strong>
        <span><button className="artist-inline" onClick={onArtist}>{track.artist}</button><i />{track.album}</span>
      </div>
      <span className="track-tone">{track.tone}</span>
      <span className="track-duration">{track.duration}</span>
      <button className={`icon-button track-heart ${isFavorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={isFavorite ? 'Убрать трек из избранного' : 'Добавить трек в избранное'}>
        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button className="icon-button track-play" onClick={onSelect} aria-label={`Статус аудиоисточника: ${track.title}`}><Play size={15} fill="currentColor" /></button>
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
  const [musicQuery, setMusicQuery] = useState('');
  const [filter, setFilter] = useState('Всё');
  const [musicMode, setMusicMode] = useState<'all' | 'favorites'>('all');
  const [selectedMusicMood, setSelectedMusicMood] = useState<string | null>(null);
  const [selectedFilm, setSelectedFilm] = useState<FilmItem | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(['echoes']);
  const [musicFavorites, setMusicFavorites] = useState<string[]>(['bluehour']);
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>(['neon', 'city']);
  const [recentTrackIds, setRecentTrackIds] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isSplashLeaving, setIsSplashLeaving] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
      if (saved) setFavorites(JSON.parse(saved) as string[]);
      if (savedHistory) setHistory(JSON.parse(savedHistory) as string[]);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName ?? '')) {
        event.preventDefault();
        setSelectedFilm(null);
        setSection('search');
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.main-search-input')?.focus(), 0);
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
  }, [filter, query]);

  const filteredTracks = useMemo(() => {
    const normalized = musicQuery.trim().toLocaleLowerCase();
    return tracks.filter((track) => {
      const matchesQuery = !normalized || [track.title, track.artist, track.album, track.tone].some((value) => value.toLocaleLowerCase().includes(normalized));
      const matchesMode = musicMode === 'all' || musicFavorites.includes(track.id);
      const matchesMood = !selectedMusicMood || track.moods.includes(selectedMusicMood);
      return matchesQuery && matchesMode && matchesMood;
    });
  }, [musicFavorites, musicMode, musicQuery, selectedMusicMood]);

  const goTo = (next: Section) => {
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
  };

  const openUnavailable = (title: string, body: string, label = 'Интеграция не подключена') => setNotice({ title, body, label });

  const handleTelegramAction = (film: FilmItem) => {
    const result = openFilmInTelegram(film.id);
    if (!result.ok) openUnavailable('Telegram-бот пока не подключён', 'Кнопка уже подготовлена для deep link вида startapp=film_<id>. Добавьте VITE_TELEGRAM_BOT_USERNAME и подключите Bot API на backend.', 'Нужна настройка Telegram');
  };

  const handleWatchAction = async (film: FilmItem) => {
    const result = await requestFilmPlayback(film.id);
    if (!result.ok) openUnavailable(result.reason === 'failed' ? 'Не удалось открыть просмотр' : 'Источник онлайн-видео не подключён', result.reason === 'failed' ? 'Backend не вернул рабочую ссылку на видео. Проверьте endpoint /api/films/:id/playback.' : 'Кнопка готова к backend endpoint /api/films/:id/playback. Пока разрешённый видеопоток не настроен, фиктивная ссылка не открывается.', result.reason === 'failed' ? 'Ошибка backend' : 'Нужно подключить видеосервис');
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSection('search');
    setSelectedFilm(null);
    setSelectedArtist(null);
    setFilter('Всё');
  };

  const chooseTrack = (track: Track) => {
    setRecentTrackIds((current) => [track.id, ...current.filter((id) => id !== track.id)].slice(0, 5));
    setActiveTrack(track);
    openUnavailable('Аудиоисточник пока не подключён', `${track.title} — ${track.artist} — пример каталога. Для настоящего воспроизведения нужен разрешённый аудиофайл или поток. Сейчас этот экран не запускает музыку.`, 'Музыка · ждёт подключения');
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
          onFavorite={() => toggleMusicFavorite(track.id)}
          onSelect={() => chooseTrack(track)}
          onArtist={() => setSelectedArtist(track.artist)}
        />
      ))}
    </div>
  ) : <EmptyState query={musicQuery || undefined} onReset={() => { setMusicQuery(''); setMusicMode('all'); }} />;

  const renderHome = () => {
    const filmsOnly = films.filter((film) => film.kind === 'Фильм');
    const sortedByRating = [...filmsOnly].sort((a, b) => Number(b.rating) - Number(a.rating));
    const latestFilms = [...filmsOnly].sort((a, b) => b.year - a.year);
    const series = films.filter((film) => film.kind === 'Сериал');

    return (
      <>
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

        <section className="content-section home-rail-section rail-now">
          <SectionHeading eyebrow="Демо-подборка" title="Сейчас смотрят" action="Весь каталог" onAction={() => goTo('movies')} />
          {renderFilmRail(sortedByRating.slice(0, 5))}
          <p className="home-demo-note">Пока это демонстрационный каталог; реальные просмотры подключим вместе с backend.</p>
        </section>

        <section className="content-section home-rail-section rail-popular">
          <SectionHeading eyebrow="Высокие оценки · пример" title="Популярное" action="Смотреть всё" onAction={() => goTo('movies')} />
          {renderFilmRail(sortedByRating.slice(0, 4))}
        </section>

        <section className="content-section home-rail-section rail-new">
          <SectionHeading eyebrow="Свежие истории" title="Новинки кино" action="В каталог" onAction={() => { goTo('movies'); setFilter('Новинки'); }} />
          {renderFilmRail(latestFilms.slice(0, 5))}
        </section>

        <section className="content-section home-rail-section rail-series">
          <SectionHeading eyebrow="Истории, к которым возвращаются" title="Сериалы" action="Все сериалы" onAction={() => goTo('movies')} />
          {renderFilmRail(series)}
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
      <div className="page-title-row"><div><div className="eyebrow">{searchPage ? 'Поиск и открытия' : 'Погрузитесь в мир кино'}</div><h1>{searchPage ? 'Что вы ищете?' : 'Фильмы и сериалы'}</h1><p>{searchPage ? 'Ищите по названию, жанру или описанию.' : 'Новые истории и знакомые эмоции.'}</p></div><div className="catalog-count"><span>{filteredFilms.length.toString().padStart(2, '0')}</span><small>историй</small></div></div>
      <form className="large-search" onSubmit={submitSearch}><Search size={18} /><input className="main-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название фильма, сериала или жанр..." aria-label="Найти фильм или сериал" /><kbd>/</kbd><button type="submit" aria-label="Искать"><ArrowRight size={18} /></button></form>
      <div className="catalog-toolbar"><div className="chip-row">{filters.map((item) => <button key={item} className={`filter-chip ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button" onClick={() => setFilter(filter === 'Новинки' ? 'Всё' : 'Новинки')}><SlidersHorizontal size={15} /> Сортировка <ChevronDown size={14} /></button></div>
      {catalogError && <ErrorState onRetry={() => setCatalogError(false)} />}
      <div className="result-label"><span>{searchPage ? 'Результаты поиска' : 'Каталог'}</span><span>{query ? `По запросу «${query}»` : 'Подборка КИНОВОЛНА'}</span></div>
      {renderFilmGrid(filteredFilms)}
    </section>
  );

  const renderMusic = () => {
    const recentlySelectedTracks = recentTrackIds.map((id) => tracks.find((track) => track.id === id)).filter((track): track is Track => Boolean(track));
    if (selectedArtist) {
      const artistTracks = tracks.filter((track) => track.artist === selectedArtist);
      const isFollowed = followedArtists.includes(selectedArtist);
      return (
        <section className="page-section music-page artist-page">
          <button className="back-link" onClick={() => setSelectedArtist(null)}><ArrowLeft size={17} /> К музыке</button>
          <div className="artist-profile-hero"><div className="artist-avatar artist-avatar-large"><AudioLines size={31} /></div><div className="artist-profile-copy"><div className="eyebrow">СТРАНИЦА ИСПОЛНИТЕЛЯ · КАТАЛОГ-ПРИМЕР</div><h1>{selectedArtist}</h1><p>Независимый исполнитель · инди и электронное звучание</p><button className="button button-primary" onClick={() => setFollowedArtists((current) => isFollowed ? current.filter((name) => name !== selectedArtist) : [...current, selectedArtist])}><Plus size={16} /> {isFollowed ? 'Вы подписаны' : 'Подписаться'}</button></div></div>
          <div className="music-toolbar"><div><div className="eyebrow">Подборка исполнителя</div><h2>Популярные треки</h2></div><Tag>Источник аудио не подключён</Tag></div>
          {renderTrackList(artistTracks)}
          <div className="integration-note"><Info size={16} /> Страница исполнителя и треки показаны на тестовых данных. Загрузка и воспроизведение аудио появятся после подключения разрешённого музыкального источника.</div>
        </section>
      );
    }

    return (
      <section className="page-section music-page">
        <div className="music-welcome"><div className="music-welcome-copy"><div className="eyebrow"><span className="overline-dot" /> ПРОСТРАНСТВО ЗВУКА</div><h1>Найдите<br /><em>свой ритм.</em></h1><p>Выбирайте ритм, открывайте новых исполнителей и собирайте свою музыку.</p><button className="button button-primary" onClick={() => openUnavailable('Распознавание музыки в разработке', 'Микрофон и настоящий сервис распознавания пока не подключены. Случайные результаты не показываются.', 'Нужен настоящий сервис')}><Mic2 size={17} /> Распознать музыку <span className="button-live-dot" /></button></div><div className="music-visual"><div className="vinyl vinyl-back" /><div className="vinyl vinyl-front"><div className="vinyl-center"><AudioLines size={21} /></div></div><div className="music-visual-label"><Disc3 size={14} /> ИСТОЧНИК НЕ ПОДКЛЮЧЁН</div></div></div>

        <div className="music-toolbar"><div><div className="eyebrow">Выберите настроение</div><h2>Музыкальные волны</h2></div><Tag>Подборки-примеры</Tag></div>
        <div className="mood-grid">
          {moodWaves.map((mood, index) => (
            <button key={mood.id} className={`mood-card ${mood.className} ${selectedMusicMood === mood.id ? 'mood-card-active' : ''}`} aria-pressed={selectedMusicMood === mood.id} onClick={() => { setSelectedMusicMood((current) => current === mood.id ? null : mood.id); setMusicMode('all'); }}>
              <span className="mood-symbol">{mood.symbol}</span><span className="mood-name">{mood.title}</span><span className="mood-sub">{mood.subtitle}</span><span className="mood-arrow">{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>

        <div className="music-toolbar"><div><div className="eyebrow">Подборки для разного настроения</div><h2>Плейлисты</h2></div><button className="text-action" onClick={() => openUnavailable('Плейлисты-примеры', 'Эти карточки показывают будущую библиотеку. Реальное сохранение пользовательских плейлистов будет добавлено вместе с backend.')}>Все подборки <ArrowRight size={15} /></button></div>
        <div className="playlist-grid">{playlists.map((playlist) => <button key={playlist.title} className={`playlist-card ${playlist.className}`} onClick={() => openUnavailable(playlist.title, 'Это пример плейлиста. Для реального прослушивания нужны разрешённые аудиофайлы или потоковый источник.', 'Источник музыки не подключён')}><span className="playlist-disc"><AudioLines size={20} /></span><span className="playlist-title">{playlist.title}</span><span className="playlist-subtitle">{playlist.subtitle} · {playlist.tracks} треков</span><span className="playlist-arrow"><Play size={14} fill="currentColor" /></span></button>)}</div>

        <div className="music-toolbar artist-toolbar"><div><div className="eyebrow">Откройте новые имена</div><h2>Исполнители</h2></div><Tag>Тестовый каталог</Tag></div>
        <div className="artist-grid">{[...new Set(tracks.map((track) => track.artist))].map((artist, index) => <button key={artist} className="artist-card" onClick={() => setSelectedArtist(artist)}><span className={`artist-avatar artist-avatar-${index + 1}`}><AudioLines size={20} /></span><strong>{artist}</strong><span>{index === 0 ? 'Инди-поп' : index === 1 ? 'Электроника' : 'Альтернатива'}</span></button>)}</div>

        <div className="music-toolbar tracks-heading"><div><div className="eyebrow">Трек, альбом или исполнитель</div><h2>Музыкальная библиотека</h2></div><Tag>Аудиоисточник не подключён</Tag></div>
        <form className="large-search music-search" onSubmit={(event) => event.preventDefault()}><Search size={18} /><input value={musicQuery} onChange={(event) => setMusicQuery(event.target.value)} placeholder="Найти песню, альбом или исполнителя..." aria-label="Поиск музыки" /><button type="button" className="music-favorite-filter" onClick={() => setMusicMode((mode) => mode === 'all' ? 'favorites' : 'all')} aria-label="Переключить избранные треки"><Heart size={15} fill={musicMode === 'favorites' ? 'currentColor' : 'none'} /></button></form>
        <div className="music-list-toolbar"><div className="chip-row"><button className={`filter-chip ${musicMode === 'all' ? 'active' : ''}`} onClick={() => setMusicMode('all')}>Все треки</button><button className={`filter-chip ${musicMode === 'favorites' ? 'active' : ''}`} onClick={() => setMusicMode('favorites')}><Heart size={12} /> Избранное</button>{selectedMusicMood && <button className="filter-chip active" onClick={() => setSelectedMusicMood(null)}>Волна: {moodWaves.find((mood) => mood.id === selectedMusicMood)?.title ?? 'настроение'} <X size={12} /></button>}</div><span>{filteredTracks.length} треков</span></div>
        {renderTrackList(filteredTracks)}
        <div className="recognition-note"><div className="recognition-icon"><Mic2 size={17} /></div><div><strong>Узнайте, что играет</strong><span>Микрофон не используется, пока не подключён настоящий сервис распознавания.</span></div><button onClick={() => openUnavailable('Распознавание музыки в разработке', 'Понадобятся API-ключ и настоящий сервис распознавания. Пока нет ни записи с микрофона, ни выдуманных результатов.', 'Требуется подключение')}>Подробнее <ChevronRight size={14} /></button></div>
        <div className="music-toolbar recent-music-toolbar"><div><div className="eyebrow">Ваша история</div><h2>Недавно слушали</h2></div><Tag>Демо · последние выборы</Tag></div>
        {recentlySelectedTracks.length ? renderTrackList(recentlySelectedTracks) : <div className="recent-music-empty"><Headphones size={19} /><span>Выбранные треки появятся здесь. В прототипе это демо-история, а не подтверждённое воспроизведение.</span></div>}
        <p className="recent-music-note">После подключения разрешённого аудио здесь будут отображаться последние реально прослушанные песни.</p>
      </section>
    );
  };

  const renderProfile = () => {
    const savedFilms = films.filter((film) => favorites.includes(film.id));
    const recentFilms = history.map((id) => films.find((film) => film.id === id)).filter((film): film is FilmItem => Boolean(film));
    const savedTracks = tracks.filter((track) => musicFavorites.includes(track.id));
    return (
      <section className="page-section profile-page">
        <div className="page-title-row"><div><div className="eyebrow">Личный раздел</div><h1>Ваш профиль</h1><p>Сохранённое и недавно просмотренное.</p></div><button className="icon-button settings-button" onClick={() => openUnavailable('Настройки появятся позже', 'Безопасный вход через Telegram, профиль и настройки добавим на этапе backend. Пароль не потребуется.')} aria-label="Настройки"><Settings2 size={19} /></button></div>
        <div className="profile-card"><div className="profile-avatar"><span>КВ</span><i /></div><div className="profile-main"><div className="profile-name">Пользователь Telegram <Tag>Профиль-пример</Tag></div><span className="profile-muted"><ShieldCheck size={14} /> Аккаунт Telegram пока не подключён</span></div><button className="button button-glass profile-connect" onClick={() => openUnavailable('Аккаунт Telegram пока не подключён', 'При запуске Mini App в Telegram подпись initData будет проверяться на сервере. Сейчас показан только пример профиля.')}>Не подключён <ChevronRight size={14} /></button></div>
        <div className="profile-stats"><div><span>{favorites.length.toString().padStart(2, '0')}</span><small>Фильмов в избранном</small></div><div><span>{recentFilms.length.toString().padStart(2, '0')}</span><small>Недавно просмотрено</small></div><div><span>{musicFavorites.length.toString().padStart(2, '0')}</span><small>Треков сохранено</small></div></div>
        <section className="content-section profile-content"><SectionHeading eyebrow="Вернитесь к просмотру" title="Недавно просмотренное" />{recentFilms.length ? <div className="film-grid">{recentFilms.map((film) => <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />)}</div> : <EmptyState onReset={() => goTo('movies')} />}</section>
        <section className="content-section profile-content"><SectionHeading eyebrow="Только для вас" title="Избранные фильмы" action="Открыть каталог" onAction={() => goTo('movies')} />{savedFilms.length ? <div className="film-grid">{savedFilms.map((film) => <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} isFavorite={favorites.includes(film.id)} onFavorite={() => toggleFilmFavorite(film.id)} />)}</div> : <EmptyState onReset={() => goTo('movies')} />}</section>
        <section className="content-section profile-content"><SectionHeading eyebrow="Ваша музыка" title="Избранные треки" action="К музыке" onAction={() => goTo('music')} />{renderTrackList(savedTracks)}</section>
        <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Конфиденциальность прежде всего.</strong> Мы не спрашиваем пароль от Telegram. Для реального профиля сервер проверит подпись Telegram Mini App.</span></div>
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
          <div className="detail-facts"><span><Star size={14} fill="currentColor" /> {film.rating}</span><i />{film.year}<i />{film.duration}<i />{film.genre}</div>
          <p>{film.description}</p>
          <div className="detail-actions">
            <button className="button button-primary" onClick={() => handleTelegramAction(film)}><ArrowRight size={16} /> Получить в Telegram</button>
            <button className="button button-glass" onClick={() => void handleWatchAction(film)}><Play size={15} fill="currentColor" /> Смотреть онлайн</button>
            <button className={`icon-button detail-fav ${favorites.includes(film.id) ? 'is-favorite' : ''}`} onClick={() => toggleFilmFavorite(film.id)} aria-label="В избранное"><Heart size={18} fill={favorites.includes(film.id) ? 'currentColor' : 'none'} /></button>
          </div>
          <div className="rights-note"><Info size={14} /> Используются только источники, которые разрешено распространять.</div>
        </div>
      </div>
      {film.kind === 'Сериал' && <section className="episodes-section"><div className="episode-heading"><div><div className="eyebrow">Первый сезон</div><h2>Серии</h2></div><button className="sort-button">Сезон 1 <ChevronDown size={14} /></button></div><div className="episode-list">{film.episodes?.map((episode, index) => <button key={episode} className="episode-row" onClick={() => openUnavailable('Видео пока не подключено', 'Источник видео серии и интеграция с Telegram-ботом пока не настроены.')}><span className="episode-number">{String(index + 1).padStart(2, '0')}</span><span className="episode-play"><Play size={14} fill="currentColor" /></span><strong>{episode}</strong><span className="episode-runtime">42 мин</span><ChevronRight size={16} /></button>)}</div></section>}
      <div className="detail-legal"><ShieldCheck size={16} /><span>Сейчас показан пример каталога. Telegram-бот, публикации канала и реальные видеопотоки подключаются отдельно.</span></div>
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
          <button className="icon-button notification-button" onClick={() => openUnavailable('Уведомления', 'Уведомления о новых материалах появятся после подключения Telegram-бота.')} aria-label="Уведомления"><Bell size={18} /><i /></button>
          <button className="top-avatar" onClick={() => goTo('profile')} aria-label="Открыть профиль"><span>КВ</span></button>
        </div>
      </header>
      <main className={`main-content ${selectedFilm ? 'main-detail' : ''}`}>
        {!selectedFilm && section !== 'home' && <div className="mobile-page-label"><Logo /><span>{section === 'music' ? 'Музыка' : section === 'movies' ? 'Кино' : section === 'search' ? 'Поиск' : 'Профиль'}</span></div>}
        {content}
        <footer className="site-footer"><div><Logo /><span>Единое пространство фильмов и музыки.</span></div><span>© 2026 КИНОВОЛНА <i /> Интерфейс · интеграции впереди</span></footer>
      </main>
      <div className="mini-player">
        <button className={`mini-art ${activeTrack?.coverStyle ?? ''}`} onClick={() => setPlayerOpen(true)} aria-label="Открыть плеер"><AudioLines size={17} /></button>
        <button className="mini-info" onClick={() => setPlayerOpen(true)}><strong>{activeTrack?.title ?? 'Выберите музыку'}</strong><span>{activeTrack ? `${activeTrack.artist} · источник не подключён` : 'Подключение аудиоисточника впереди'}</span></button>
        <div className="mini-progress"><span /></div>
        <button className="mini-play" onClick={() => openUnavailable('Аудио пока не подключено', 'В этой версии нет аудиофайла или потока для воспроизведения. Плеер заработает после подключения разрешённого источника.', 'Нужен аудиоисточник')} aria-label="Статус аудиоисточника"><Play size={16} fill="currentColor" /></button>
        <button className="mini-expand" onClick={() => setPlayerOpen(true)} aria-label="Открыть полноэкранный плеер"><Maximize2 size={15} /></button>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`mobile-nav-item ${section === id && !selectedFilm ? 'mobile-nav-active' : ''}`} onClick={() => goTo(id)}><span className="mobile-icon-wrap"><Icon size={19} strokeWidth={section === id ? 2.3 : 1.8} /></span><span>{label}</span></button>)}
      </nav>
      {playerOpen && <div className="player-overlay" onClick={() => setPlayerOpen(false)} role="presentation"><section className="player-modal" role="dialog" aria-modal="true" aria-label="Полноэкранный плеер" onClick={(event) => event.stopPropagation()}>
        <button className="player-close icon-button" onClick={() => setPlayerOpen(false)} aria-label="Закрыть плеер"><X size={19} /></button>
        <div className={`player-cover ${activeTrack?.coverStyle ?? 'cover-moon'}`}><AudioLines size={45} /></div>
        <Tag><Disc3 size={13} /> ИСТОЧНИК АУДИО НЕ ПОДКЛЮЧЁН</Tag>
        <h2>{activeTrack?.title ?? 'Выберите трек'}</h2>
        <button className="player-artist" onClick={() => { if (activeTrack) { setPlayerOpen(false); setSelectedArtist(activeTrack.artist); setSection('music'); } }}>{activeTrack?.artist ?? 'КИНОВОЛНА'}</button>
        <div className="player-timeline"><span>--:--</span><input type="range" min="0" max="100" defaultValue="0" disabled aria-label="Позиция воспроизведения" /><span>{activeTrack?.duration ?? '--:--'}</span></div>
        <div className="player-controls"><button onClick={() => openUnavailable('Аудио не подключено', 'Перемотка станет доступна после подключения разрешённого аудиопотока.')} aria-label="Предыдущий трек"><SkipBack size={19} fill="currentColor" /></button><button className="player-main-control" onClick={() => openUnavailable('Аудио не подключено', 'Для воспроизведения нужен реальный аудиофайл или разрешённый поток.')} aria-label="Воспроизвести"><Play size={19} fill="currentColor" /></button><button onClick={() => openUnavailable('Аудио не подключено', 'Перемотка станет доступна после подключения разрешённого аудиопотока.')} aria-label="Следующий трек"><SkipForward size={19} fill="currentColor" /></button></div>
        <div className="player-volume"><Volume2 size={16} /><input type="range" min="0" max="100" defaultValue="60" disabled aria-label="Громкость" /><span>Воспроизведение появится после подключения аудиоисточника</span></div>
      </section></div>}
      {notice && <div className="modal-backdrop" onClick={() => setNotice(null)} role="presentation"><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-title" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={() => setNotice(null)} aria-label="Закрыть"><X size={18} /></button><div className="modal-emblem"><Info size={20} /></div><span className="eyebrow">{notice.label ?? 'Информация'}</span><h2 id="notice-title">{notice.title}</h2><p>{notice.body}</p><button className="button button-primary modal-done" onClick={() => setNotice(null)}>Понятно <Check size={16} /></button></section></div>}
    </div>
  );
}

export default App;
