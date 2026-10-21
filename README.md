# КИНОВОЛНА — медиаплатформа для Telegram Mini App

Цель КИНОВОЛНА — подключить Mini App к вашему существующему Telegram-боту и объединить в одном интерфейсе фильмы, сериалы и музыку. Вторая версия сохраняет первый интерфейс и добавляет сервер Telegram Bot API, PostgreSQL и API каталога. Реальная связь с вашим ботом требует серверного токена, ID канала, прав администратора и HTTPS-хостинга. Онлайн-видео, реальный аудиопоток и распознавание музыки пока не подключены.

## Ikkinchi bosqich: backend va Telegram

Mavjud kod va Git tarixi saqlangan. `server/` Telegram webhook, Mini App HMAC tekshiruvi, yopiq kanal a’zoligi nazorati va katalog API uchun qo‘shilgan. `scripts/` bazaning migratsiyasi va botni tekshirish/ulash buyruqlarini beradi. Telegram yangiliklari PostgreSQLga yoziladi; «Получить в Telegram» faqat bazadagi haqiqiy film uchun bot yoki kanal postiga olib boradi. Demo ma’lumotlar `src/data.ts`da saqlanadi, faqat «Посмотреть демо» orqali alohida ochiladi.

To‘liq sozlash, Windows/Linux, Docker Compose va eski postlarni import qilish: **[Ikkinchi bosqich qo‘llanmasi](docs/stage-2-setup.md)**.

Qisqa lokal yo‘l: `pnpm install --frozen-lockfile`, `.env.example`dan `.env` nusxasi, PostgreSQL uchun `DATABASE_URL`ni to‘ldirish, `pnpm db:migrate`, so‘ng `pnpm dev`. Frontend `http://localhost:3000`, API `http://localhost:3001`. `pnpm dev:web` faqat frontend, `pnpm dev:server` faqat API. `pnpm preview` faqat buildni ko‘rsatadi — backend emas. Production uchun `pnpm build`, keyin `NODE_ENV=production pnpm start`; Windows PowerShell: `$env:NODE_ENV='production'; pnpm start`.

Bot uchun server muhitida `TELEGRAM_BOT_TOKEN`, webhook ulashda esa `TELEGRAM_WEBHOOK_SECRET` kerak. `MINI_APP_URL` haqiqiy ommaviy HTTPS manzil bo‘lishi shart. `TELEGRAM_ADMIN_IDS` admin Telegram ID’lari; `TELEGRAM_CHANNEL_ID` va PostgreSQL katalog indekslash/sonlarni hisoblash uchun kerak. `TELEGRAM_BOT_USERNAME` `pnpm telegram:check`da solishtirish uchun ixtiyoriy. Token va baza paroli faqat server `.env` yoki hosting secrets’da saqlanadi; **hech qachon `VITE_*`ga yozilmaydi**. Bot kanal administratori bo‘lishi kerak. `pnpm telegram:check` token bo‘lsa avval `getMe` orqali botni tekshiradi; kanal ID sozlangan bo‘lsa kanal va admin huquqini ham tekshiradi. HTTPS server tayyor bo‘lgach, webhook va menu alohida qo‘lda o‘rnatiladi; mavjud webhook avtomatik almashtirilmaydi.

Tekshiruvlar: `pnpm typecheck`, `pnpm build`, `pnpm test`. Alohida sinov PostgreSQL bazasi bilan `TEST_DATABASE_URL=… pnpm test:integration`. Sinovlar haqiqiy PostgreSQLdan foydalanadi, Telegram tarmog‘i esa aniq belgilangan test double bilan tekshiriladi. Bu foydalanuvchining haqiqiy boti allaqachon ulanganini anglatmaydi.

Yopiq kanalning eski tarixini Bot API avtomatik bera olmaydi. Admin import API mavjud, ammo eski post IDlari va tavsiflarini alohida tayyorlash kerak. Haqiqiy video URL yo‘q: `/api/films/:id/playback` `503 video_source_not_configured` qaytaradi. Top‑10/Top‑20, real musiqa, tashqi metadata API, akkauntga sinxronlangan sevimlilar va video streaming ushbu bosqichda amalga oshirilmagan. Quyidagi dastlabki bosqich qaydlari tarix va dizayn izohi sifatida saqlangan.

## Запуск в Windows

1. Установите Node.js 22 или новее.
2. Откройте PowerShell в папке проекта.
3. Включите Corepack, установите закреплённую версию pnpm и зависимости:

   ```powershell
   corepack enable
   corepack prepare pnpm@11.25.0 --activate
   pnpm install
   ```

4. Запустите проект командой `pnpm dev`.
5. Откройте `http://localhost:3000` в браузере.
6. Для проверки сборки выполните `pnpm build`.

## Структура проекта

- `src/App.tsx` — страницы, поиск, избранное, карточки и честные статусы пока не подключённых сервисов.
- `src/data.ts` — демонстрационный каталог; позже его заменит серверная база данных.
- `src/styles.css` — адаптивный тёмный интерфейс.
- `bot/index.mjs` — Telegram-бот: `/start`, `/help`, `/id`, неизвестные команды и защищённое меню администратора.
- `public/manus-routes.json` — список страниц для Preview.
- `public/favicon.svg` — знак КИНОВОЛНА.
- `.env.example` — названия настроек будущего backend без секретных значений.

## Что подготовить к интеграции

- **Бот:** его публичный username, например `@example_bot`. Сам токен заранее присылать не нужно — позже он будет добавлен через защищённое поле секретов, а не в чат или frontend.
- **Канал с видео:** публичный username `@...` либо ID частного канала (`-100…`), его название и указание публичный он или частный. Бота нужно будет добавить в канал администратором с правом видеть/получать публикации. Если бот ещё не добавлен, это можно сделать непосредственно перед интеграцией.
- **Доступ администратора:** Telegram numeric ID владельца/редакторов, которым разрешено менять каталог. Это не пароль и не токен.
- **Каталог и права:** названия, описания, постеры, жанры и годы; важно подтвердить, что вы имеете право распространять видео и аудио.
- **Онлайн-просмотр:** если нужен плеер внутри Mini App, понадобится разрешённый источник прямого видео/потока или отдельный видеохостинг. Сам пост Telegram не создаёт публичную ссылку для HTML5-плеера.
- **Музыка:** собственные/лицензированные аудиофайлы либо разрешённый потоковый источник. Для распознавания позже выберем настоящий сервис и отдельно настроим его API-ключ.

Не нужно передавать пароль Telegram. Bot token и API-ключи не помещаются в исходный код или GitHub. Telegram Mini App должна проверять подпись `initData` на сервере. Если будет использоваться аудио/видео, все добавляемые источники должны быть разрешены для распространения.

## Telegram-бот

Команды бота принимает существующий защищённый webhook backend (`pnpm start`). `pnpm bot:start` — совместимый alias того же сервера; запускайте только один процесс. Отдельный `getUpdates`/long polling для этого токена не используется. Сервер может стартовать до подключения базы, но для Telegram webhook нужны постоянный HTTPS-хостинг и server-only переменные окружения:

```text
TELEGRAM_BOT_TOKEN=          # только server secret, не коммитить
MINI_APP_URL=                # настоящий HTTPS production URL опубликованной Mini App
TELEGRAM_ADMIN_IDS=          # один или несколько Telegram ID через запятую
```

`/start`, `/help`, `/id` и защищённое меню `/admin` обрабатываются webhook-телом и не требуют PostgreSQL. Кнопка Mini App в `/start` появляется только при настоящем публичном HTTPS `MINI_APP_URL`; иначе бот честно объясняет, что URL пока не настроен. `/admin` и каждый callback повторно проверяют Telegram ID администратора. Каталог и статистика требуют PostgreSQL и `TELEGRAM_CHANNEL_ID`; показывается только реальный размер каталога, а просмотры/поиски/прослушивания не выдумываются. Проверка интеграций обращается к Bot API и проверяет права бота в канале, если настроен channel ID.

Проверки кода без live-токена: `pnpm bot:check`, `pnpm typecheck`, `pnpm build` и `pnpm test`. После добавления токена `pnpm telegram:check` безопасно проверяет `getMe` даже до настройки канала и username; он не печатает токен. После размещения сервера задайте `PUBLIC_BASE_URL` и `TELEGRAM_WEBHOOK_SECRET`, затем осознанно выполните `pnpm telegram:webhook`. `pnpm telegram:menu` устанавливает Telegram menu button и требует настоящий `MINI_APP_URL`. Эти команды меняют внешнюю конфигурацию Telegram и сейчас не запускались.

## Заставка и изображения

При каждом новом запуске страницы показывается короткая кинематографичная заставка КИНОВОЛНА: затемнённый фон, бирюзово-синие световые лучи, анимированный знак и надпись «МИР КИНО И МУЗЫКИ». Она длится около 2,3 секунды, её можно пропустить; при системной настройке `prefers-reduced-motion` анимация сокращается. После заставки открывается рабочий демонстрационный каталог с горизонтальными лентами «Сейчас смотрят», «Популярное», «Новинки кино» и «Сериалы». Текущие названия фильмов демонстрационные и не имеют подтверждённых интернет-постеров. Когда появятся реальные названия и годы, для каждого фильма отдельно найдём совпадающий постер через разрешённый каталог изображений в наибольшем подходящем разрешении. Чужой или случайный постер не подставляем. Если вы пришлёте собственные картинки, их тоже можно использовать.
