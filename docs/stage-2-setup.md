# Stage 2 — sozlash va ishga tushirish

TurboMedia Mini App uchun texnik qo‘llanma. **Interfeys rus tilida**, qo‘llanma o‘zbek (lotin) tilida. Token, parol va haqiqiy Telegram ID bu hujjatga yozilmaydi.

## Talablar va holat

| Qism | Talab / holat |
|---|---|
| Backend | Node.js `>=22.13.0`, ESM, Express 5; `server/index.mjs`, standart `PORT=3001`. |
| Ma’lumotlar bazasi | PostgreSQL 16+. |
| Paketlar | pnpm `11.25.0`; `node -v`, `pnpm -v`, `docker compose version` bilan tekshiring. |
| Dev rejimi | `pnpm dev` API (`3001`) va Vite (`3000`)ni ishga tushiradi; Vite API uchun proxy qiladi. |
| Production | `NODE_ENV=production pnpm start` oldindan yig‘ilgan `dist`ni va API’ni Express orqali beradi. |

Bot username’i, kanal/admin ID’lari va token berilmagan; **live Telegram integratsiyasi tekshirilmagan**. `.env` va `.env.*` Git’dan chiqarilgan, faqat `.env.example` qoladi. Secretni hech qachon `VITE_*`, frontend bundle yoki GitHub’ga qo‘ymang; `DATABASE_URL` ham faqat environmentdan o‘qiladi.

## Environment

Repo ildizida namuna yarating:

```bash
# Linux/macOS
cp .env.example .env
# Windows PowerShell
Copy-Item .env.example .env
```

Webhook secretini yaratish (`32` ta hex belgi, 16 random bayt; uni saqlang, ulashmang):

```bash
node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))"
```

| O‘zgaruvchi | Qiymat va qoida |
|---|---|
| `NODE_ENV`, `PORT` | `development`/`production`; port odatda `3001`. |
| `APP_ORIGIN` | Vergul bilan ajratilgan **aniq origin**lar: `http://localhost:3000,https://app.example.com`. Wildcard, yo‘l, query yoki hash yozilmaydi. |
| `TRUST_PROXY_HOPS` | Standart `0`. Faqat bitta ishonchli proxy ortida `1`; app porti public yopiq va proxy `X-Forwarded-For`ni mijozdan ko‘chirmay, haqiqiy IP bilan qayta yozishi shart. |
| `DATABASE_URL` | `postgres://`/`postgresql://`; lokal xost `127.0.0.1:5432`, parol URL-encoded. |
| `POSTGRES_PASSWORD` | Compose Postgres’i uchun alohida kuchli secret. |
| `DOCKER_DATABASE_URL` | `postgres://kinovolna:<URL-encoded-password>@db:5432/kinovolna`; konteyner ichida host `db`. |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni; faqat server secret’i. |
| `TELEGRAM_BOT_USERNAME` | `@`siz bot username. |
| `TELEGRAM_CHANNEL_ID` | Raqamli `-100...` kanal ID; public username emas. |
| `TELEGRAM_ADMIN_IDS` | Vergul bilan ajratilgan musbat user ID: `123,456`. |
| `TELEGRAM_WEBHOOK_SECRET` | Yuqorida yaratilgan random hex, webhook header bilan solishtiriladi. |
| `TELEGRAM_CHANNEL_INVITE_URL` | Ixtiyoriy `https://t.me/+...`/`joinchat/...`; a’zo bo‘lmaganga yuboriladi. |
| `TELEGRAM_INIT_DATA_MAX_AGE` | Soniyada; standart `3600`, ruxsat 1–86400. |
| `PUBLIC_BASE_URL`, `MINI_APP_URL` | Public **HTTPS** URLlar: mos ravishda webhook bazasi va bot menyusidagi Mini App. |
| `VITE_API_BASE_URL` | Faqat public API URL; bo‘sh bo‘lsa dev proxy ishlaydi. Secret bo‘lishi mumkin emas. |

`MEDIA_STORAGE_BASE_URL` va `AUDIO_RECOGNITION_API_KEY` kelajak uchun saqlangan, bu bosqichda ishlatilmaydi. `VITE_TELEGRAM_BOT_USERNAME` ham moslik uchun, asosiy sozlama serverdagi `TELEGRAM_BOT_USERNAME`. Har qanday `VITE_*` bundle’ga chiqishi mumkin.

## Lokal ishga tushirish

Linux’da yoki WSL’da:

```bash
pnpm install --frozen-lockfile
cp .env.example .env       # .env ni yuqoridagi jadval bo‘yicha tahrirlang
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Windows PowerShell’da:

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env # keyin .env ni tahrirlang
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Docker Desktop ishlayotganini tekshiring. Lokal `.env` uchun `DATABASE_URL=postgres://kinovolna:<URL-encoded-password>@127.0.0.1:5432/kinovolna`; `POSTGRES_PASSWORD`dagi parol bilan mos bo‘lsin. Browser: `http://localhost:3000`; liveness: `curl http://127.0.0.1:3001/api/health`. Telegram sozlamalari yo‘q bo‘lsa jarayon ochiladi, ammo katalog va Telegram bilan himoyalangan endpointlar `configuration_required` qaytaradi.

## Production — Docker Compose

Joriy `compose.yaml`: `db` (PostgreSQL 16), bir martalik `migrate`, va `app`. DB `127.0.0.1:5432`, app `127.0.0.1:3001`ga bog‘langan; public HTTPS uchun alohida reverse proxy kerak.

Bitta Nginx/Caddy proxy bo‘lsa, `TRUST_PROXY_HOPS=1` qo‘ying va app portini internetdan ochmang. Barcha kirish yo‘llari aynan shu proxy orqali kelishi kerak; aks holda IP soxtalashtirib rate-limitni chetlab o‘tish mumkin. Proxy zanjiri boshqacha bo‘lsa, haqiqiy hop sonini tekshirmasdan bu sozlamani ko‘paytirmang. API javoblari server tomonidan `private, no-store` bilan keshdan chiqariladi; CDN/proxyda `/api/*` uchun cache qoidasini yoqmang.

1. Serverdagi `.env`ni to‘ldiring: `PUBLIC_BASE_URL` va `MINI_APP_URL` HTTPS, `APP_ORIGIN` esa foydalanuvchi ochadigan aniq frontend origin bo‘lsin. `DATABASE_URL` lokal/host ulanishi, `DOCKER_DATABASE_URL` esa `db` hostli konteyner ulanishidir.
2. Image va DB’ni tayyorlang:

   ```bash
   docker compose build
   docker compose up -d db
   docker compose ps
   ```

3. **Avval** migratsiya, **keyin** app:

   ```bash
   docker compose run --rm migrate
   docker compose up -d app
   docker compose logs -f app
   ```

`migrate` va `app` DB healthcheck’ini kutadi. App startidan oldin `migrate` muvaffaqiyatli tugaganini operator tekshiradi. `docker compose down -v` bazaning volume’ini o‘chiradi — oddiy qayta ishga tushirish uchun bu buyruqni ishlatmang. Backupni alohida saqlang.

```bash
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/ready
```

`/api/health` jarayon liveness’i (`200`); `/api/ready` DB `SELECT 1` bajaradi va DB ishlamasa `503`. Docker image `dist`ni build bosqichida yaratadi.

## Telegram xavfsiz sozlamasi

1. Botni maqsad kanaliga **administrator** qilib qo‘shing. [getChatMember](https://core.telegram.org/bots/api/methods/getchatmember.md) boshqa foydalanuvchilar uchun bu tekshiruv bot admin bo‘lganda kafolatlanishini aytadi.
2. Bot API tokenini tekshirish uchun `TELEGRAM_BOT_TOKEN` kiriting. `TELEGRAM_BOT_USERNAME` — faqat token bilan mosligini solishtirish uchun ixtiyoriy; kanalni tekshirish uchun `-100...` `TELEGRAM_CHANNEL_ID` va botni kanalga administrator qilib qo‘shish kerak. Webhook/admin menyusi uchun mos secretlar va HTTPS URLlarni server muhitiga kiriting; so‘ng avval faqat tekshiring:

   ```bash
   pnpm telegram:check
   ```

   Token mavjud bo‘lsa, `getMe` va joriy webhook holati tekshiriladi. `TELEGRAM_CHANNEL_ID` sozlangan bo‘lsa, kanal turi va botning administrator huquqi ham tekshiriladi; token bo‘lmasa Telegram API’ga so‘rov yuborilmaydi.
3. Production endpoint tayyor bo‘lgach webhook va menyuni alohida o‘rnating:

   ```bash
   pnpm telegram:webhook
   pnpm telegram:menu
   ```

Webhook manzili `PUBLIC_BASE_URL`dan `https://…/api/telegram/webhook` bo‘ladi. Script boshqa URL’ga qaragan mavjud webhookni almashtirishdan bosh tortadi. Faqat ta’sirini tekshirib, aynan o‘sha botning boshqa backendini almashtirmoqchi bo‘lsangiz:

```bash
pnpm telegram:check
pnpm telegram:webhook -- --replace-webhook
```

Webhook boot vaqtida avtomatik o‘rnatilmaydi. Webhook va `getUpdates`ni bir vaqtda ishlatmang; botni ko‘chirish boshqa backendga ta’sir qilishi mumkin. `setWebhook` Telegramning `X-Telegram-Bot-Api-Secret-Token` headerini yuboradi, `secret_token` ruxsatlari hamda `drop_pending_updates: false` [rasmiy setWebhook hujjatida](https://core.telegram.org/bots/api/methods/setwebhook.md) bayon qilingan.

Qabul qilinadigan update’lar: `channel_post`, `edited_channel_post`, `message`, `callback_query`. `/start` ruscha welcome va `🎬 Открыть КИНОВОЛНУ` Mini App tugmasini beradi; `/help`, `/id` va noma’lum komandalar ham ishlaydi. Kanal text/caption’ining birinchi bo‘sh bo‘lmagan qatori sarlavha, qolganlari tavsif; noma’lum metadata — yil `0`, janr `Не указан`, reyting `—`. `/start film_<uuid>` avval a’zolikni tekshiradi, keyin **original kanal posti** `t.me` havolasini yuboradi: media nusxalanmaydi va protected content chetlab o‘tilmaydi. A’zo bo‘lmagan foydalanuvchi havola orqali qabul qilinmaydi. `/admin` va callback tugmalari faqat `TELEGRAM_ADMIN_IDS` dagi IDlar uchun ishlaydi.

Telegram update’lari odatda 24 soatdan ortiq saqlanmaydi va tarixni to‘liq o‘qish metodi yo‘q ([Bot API](https://core.telegram.org/bots/api)). Shuning uchun eski postlar butun tarixdan avtomatik import qilinmaydi: admin faqat oldindan ma’lum `messageId`lar bilan qo‘lda import qiladi.

Import so‘rovining JSON namunasi (quyidagi kanal/message IDlar haqiqiy emas, o‘zingiznikiga almashtiring):

```json
{"items":[{"title":"Filmning haqiqiy nomi","description":"Postdagi tavsif","channelId":"-1001234567890","messageId":55,"year":2024,"genre":"Драма","kind":"Фильм"}]}
```

JSONni `POST /api/admin/films/import`ga yuboring. Headerlar: `Content-Type: application/json` va `X-Telegram-Init-Data: <Mini Appdan olingan yangi imzolangan initData>`. `initData`ni ham sirli sessiya ma’lumoti kabi saqlang, GitHub yoki ochiq logga joylamang. Admin user ID serverdagi allowlistda bo‘lishi shart. Endpoint metadata’ni saqlaydi, ammo eski post mavjudligi yoki video huquqini avtomatik tasdiqlamaydi; ID va tarqatish huquqini operator tekshiradi.

Takroriy webhook update’lari bazada bir marta qayd qilinadi. Telegramga xabar yuborish va DB commit bir atomar operatsiya emas: yuborishdan keyin server uzilsa, qayta urinishda bot javobi takrorlanishi mumkin. Bu kanal yozuvini yoki film UUIDsini ko‘paytirmaydi.

## API qisqa shartnomasi

| Endpoint | Ruxsat / javob |
|---|---|
| `POST /api/telegram/auth` | Body `{ "initData": "..." }`; Mini App initData HMAC va muddatini tekshiradi. |
| `GET /api/config` | Faqat `telegramConfigured`, `databaseConfigured`, `channelConfigured` booleanlari; secret yo‘q. |
| `GET /api/health` | Jarayon uchun `200`. |
| `GET /api/ready` | DB readiness; DB yo‘q bo‘lsa `503`. |
| `GET /api/films?limit&offset&q` | `X-Telegram-Init-Data` va kanal a’zoligi; `limit` 1–100. |
| `GET /api/films/:uuid` | Xuddi shu auth/a’zolik bilan bitta film. |
| `GET /api/films/:uuid/telegram` | Bot username bo‘lsa `film_<uuid>` start URL, aks holda original kanal havolasi. |
| `GET /api/films/:uuid/playback` | Video manbasi yo‘q, `503`. |
| `POST /api/admin/films/import` | HMAC-auth qilingan `TELEGRAM_ADMIN_IDS`; `items` 1–100, har birida `title`, `description`, `channelId`, `messageId`, ixtiyoriy `year`, `genre`, `poster`, `kind`; faqat sozlangan kanal. |
| `POST /api/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` majburiy; Telegram update’ini qabul qiladi. |

`initData` HMAC’da Bot tokenidan `WebAppData` kalitli SHA-256 secret olinadi; `hash`dan tashqari maydonlar saralanadi, `signature` bo‘lsa satrda qoladi; `auth_date` `TELEGRAM_INIT_DATA_MAX_AGE`dan eski bo‘lmasligi shart. Bu [Telegram Mini Apps validatsiyasi](https://core.telegram.org/bots/webapps)dagi HMAC sxemasi. Ed25519 uchinchi tomon sxemasi alohida: unda `hash` va `signature` chiqarib tashlanadi.

## Test va cheklovlar

```bash
pnpm typecheck
pnpm build
pnpm test
# Linux/macOS: faqat alohida, sinov uchun ajratilgan PostgreSQL
TEST_DATABASE_URL='<test-db-connection-string>' pnpm test:integration
# PowerShell: $env:TEST_DATABASE_URL='<test-db-connection-string>'; pnpm test:integration
```

`TEST_DATABASE_URL` berilmasa integratsion testlar skip bo‘ladi. Berilganda ular faqat o‘zining noyob sinov schema’sini yaratib, oxirida olib tashlaydi; production bazangizni ko‘rsatmang. Oddiy `DATABASE_URL` testlar tomonidan ishlatilmaydi. Ushbu ishda lokal PostgreSQL bilan testlar bajarildi; Telegram tarmog‘i ataylab test double bilan almashtirildi. Bu haqiqiy Bot API, kanal ruxsatlari, webhook yoki production HTTPS ishlaganini isbotlamaydi. Live tekshiruv — haqiqiy secretlar bilan `pnpm telegram:check`, webhook va yangi kanal postidan keyin. Docker fayllari tayyorlangan, ammo ushbu muhitda Docker image build/deploy bajarilmadi.

Bu bosqich online video, yangi posterlar, musiqa yoki Top 10/Top 20ni va’da qilmaydi. Demo fayl saqlangan bo‘lsa, faqat foydalanuvchi uni aniq tugma bilan tanlaganda ishlatiladi. Eski `/manus-storage/...` media URL’lari avvalgi hostga bog‘langan, tashqi deploy’da `404` berishi mumkin; ular tiklangan deb hisoblanmaydi.
