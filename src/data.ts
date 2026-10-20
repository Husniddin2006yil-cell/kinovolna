export type Film = {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  rating: string;
  genre: string;
  duration: string;
  description: string;
  poster: string;
  badge?: string;
  kind: 'Фильм' | 'Сериал';
  episodes?: string[];
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  coverStyle: string;
  tone: string;
  moods: string[];
};

const poster = {
  orbit: '/manus-storage/async-images/3lFoOyXSxcODIZnEWqMKJO/image-2.webp',
  noir: '/manus-storage/async-images/3lFoOyXSxcODIZnEWqMKJO/image-3.webp',
  desert: '/manus-storage/async-images/3lFoOyXSxcODIZnEWqMKJO/image-4.webp',
  city: '/manus-storage/async-images/3lFoOyXSxcODIZnEWqMKJO/image-5.webp',
};

export const films: Film[] = [
  {
    id: 'orbit',
    title: 'Последний сигнал',
    originalTitle: 'The Last Signal',
    year: 2026,
    rating: '8.6',
    genre: 'Фантастика',
    duration: '2 ч 08 мин',
    description: 'Таинственное сообщение с заброшенной станции на орбите Луны ставит молодого инженера перед решением, от которого зависит будущее человечества. Дальние миры, тишина космоса и неожиданные повороты — в оригинальной истории КИНОВОЛНА.',
    poster: poster.orbit,
    badge: 'Новинка',
    kind: 'Фильм',
  },
  {
    id: 'neon',
    title: 'Неоновые следы',
    originalTitle: 'Neon Traces',
    year: 2025,
    rating: '8.3',
    genre: 'Триллер',
    duration: '1 ч 54 мин',
    description: 'Город не спит. Каждое отражение — улика, каждая улица — часть незаконченной истории. Детектив Лейла ищет пропавшего композитора и находит тайну из собственного прошлого.',
    poster: poster.noir,
    badge: 'Топ 10',
    kind: 'Фильм',
  },
  {
    id: 'portal',
    title: 'Тихий портал',
    originalTitle: 'Quiet Portal',
    year: 2025,
    rating: '8.1',
    genre: 'Приключения',
    duration: '1 ч 47 мин',
    description: 'Древние врата на краю пустыни открываются раз в сто лет. Двум незнакомцам предстоит пройти сквозь них и найти дорогу назад, пока не истекло время.',
    poster: poster.desert,
    badge: 'Премьера',
    kind: 'Фильм',
  },
  {
    id: 'city',
    title: 'Когда город спит',
    originalTitle: 'While the City Sleeps',
    year: 2024,
    rating: '7.9',
    genre: 'Драма',
    duration: '1 ч 41 мин',
    description: 'Трое незнакомцев встречаются на одной остановке дождливым вечером. Их разговоры напоминают: даже в привычном городе всегда есть место для нового начала.',
    poster: poster.city,
    kind: 'Фильм',
  },
  {
    id: 'echoes',
    title: 'Эхо тишины',
    originalTitle: 'Echoes of Silence',
    year: 2025,
    rating: '8.8',
    genre: 'Драма',
    duration: 'Сезон 1 · 8 серий',
    description: 'Каждый вечер маленькая радиостанция в горном посёлке получает письмо от неизвестного слушателя. Журналист Мохира изучает архив эфиров, чтобы раскрыть тайну.',
    poster: poster.city,
    badge: 'Сериал',
    kind: 'Сериал',
    episodes: ['Серия 1 · Возвращение в эфир', 'Серия 2 · Следы под снегом', 'Серия 3 · Незнакомый голос', 'Серия 4 · Последняя частота'],
  },
  {
    id: 'horizon',
    title: 'Чёрный горизонт',
    originalTitle: 'Black Horizon',
    year: 2023,
    rating: '7.8',
    genre: 'Фантастика',
    duration: '2 ч 02 мин',
    description: 'Межзвёздная экспедиция сбивается с курса и оказывается в области, которой нет ни на одной карте. Экипаж ищет путь домой и заново понимает, что значит быть рядом.',
    poster: poster.orbit,
    kind: 'Фильм',
  },
  {
    id: 'afterlight',
    title: 'До рассвета',
    originalTitle: 'Before Dawn',
    year: 2024,
    rating: '8.0',
    genre: 'Триллер',
    duration: '1 ч 49 мин',
    description: 'В прибрежном отеле внезапно гаснет свет. До утра связи между гостями будут раскрываться одна за другой.',
    poster: poster.noir,
    kind: 'Фильм',
  },
];

export const tracks: Track[] = [
  { id: 'midnight', title: 'Полночь', artist: 'Sabo', album: 'Огни города', duration: '3:42', coverStyle: 'cover-moon', tone: 'Инди-поп', moods: ['love', 'road', 'sad'] },
  { id: 'bluehour', title: 'Синий час', artist: 'Ravon', album: 'Тихая волна', duration: '4:08', coverStyle: 'cover-blue', tone: 'Электроника', moods: ['work', 'happy'] },
  { id: 'distance', title: 'Расстояние', artist: 'Yulduz & Diyor', album: 'Дороги', duration: '3:26', coverStyle: 'cover-dusk', tone: 'Альтернатива', moods: ['road', 'love'] },
  { id: 'quiet', title: 'В тишине', artist: 'Sabo', album: 'Ты не один', duration: '3:57', coverStyle: 'cover-green', tone: 'Инди-поп', moods: ['work', 'sad'] },
];

export const generatedArt = {
  hero: '/manus-storage/async-images/3lFoOyXSxcODIZnEWqMKJO/image-1.webp',
};
