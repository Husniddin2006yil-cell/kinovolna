# КИНОВОЛНА — TODO

## Demo prototip va premium dizayn

- [x] **Asosiy interfeys:** КИНОВОЛНА nomli Telegram Mini App uchun ruscha, demo ma’lumotli ishlaydigan interfeys yaratildi; mobil va desktop brauzerga mos. Telegram kanal/bot, real audio/video va musiqa tanish servisi ulanmagan bo‘lsa ishlayotgandek ko‘rsatilmaydi.
- [x] **Bosh sahifa va navigatsiya:** Qidiruv, katta banner, tavsiya bloklari, gorizontal poster kartalari, desktop navigatsiyasi va mobil pastki navigatsiya ishlaydi.
- [x] **Film va serial katalogi:** Poster, nom, yil, janr, tavsif, qidiruv, filtrlar, tafsilotlar, sevimlilar va serial mavsum/epizodlari demo ma’lumotlar bilan mavjud.
- [x] **Kino integratsiya holatlari:** “Telegramda olish” va “Onlayn ko‘rish” tugmalari ulanmagan manbani ochiq bildiradi; soxta media URL ishlatilmaydi.
- [x] **Musiqa kutubxonasi va profil:** Demo treklar, qidiruv, ijrochilar, playlistlar, trekni yurakcha bilan sevimliga qo‘shish, mini-player/full-player va profil ichidagi saqlanganlar/ko‘rish tarixi ko‘rinishlari mavjud.
- [x] **Haqiqiy bo‘lmagan media holati:** Ruxsatli audio manbasi ulanmagani uchun player soxta audio qo‘ymaydi; musiqa tanish servisi ulanmagani uchun tasodifiy natija yoki mikrofon yozuvi yo‘q.
- [x] **КИНОВОЛНА nomi:** Ko‘rinadigan wordmark, brauzer title, route manifest va Windows qo‘llanmasi yangi nomga moslangan.
- [x] **Splash Screen:** Ilova ochilganda qoramtir, kinematik to‘liq ekranli sahna chiqadi. Markazdagi animatsiyali «КИНОВОЛНА» wordmark’i bo‘ylab yorug‘lik yuguradi va neon nur tarqaladi; fonida nur yo‘llari, mayin zarrachalar va chuqurlik bor. Pastda «МИР КИНО И МУЗЫКИ» yozuvi paydo bo‘ladi. Fade-in, blur-to-focus va silliq o‘tish bilan odatiy holatda taxminan 2,3 soniya davom etadi; `Пропустить` tugmasi mavjud.
- [x] **Splash ishlash siyosati:** Zаставка yangi sahifa ishga tushganda ko‘rinadi, uzoq ushlamaydi va bosh sahifaga o‘tadi; tizimdagi `prefers-reduced-motion` sozlamasida animatsiya taxminan 0,2 soniyagacha qisqaradi. Demo bosqichida haqiqiy tarmoq yuklanishi yo‘q; mavjud bo‘lmagan server loading’i soxta ko‘rsatilmaydi.
- [x] **Premium bosh sahifa:** Avval yuqori panel, keyin katta film banneri, so‘ng kartalar paydo bo‘ladi. «Сейчас смотрят», «Популярное», «Новинки кино», «Сериалы» gorizontal bo‘limlari va alohida musiqa bloki bor.
- [x] **Responsive va yengil animatsiyalar:** Qora/grafit va qoramtir ko‘k ranglar, elektr-ko‘k/turkuaz aksentlar, yumshoq burchakli kartalar, nozik soyalar va silliq hover/bosish holatlari ishlatiladi. Intro CSS animatsiyalari va statik zarrachalar bilan bajarilgan; qidiruv/kartalardan foydalanishni to‘sib qo‘ymaydi.
- [x] **Windows qo‘llanmasi:** Node.js/pnpm o‘rnatish, lokal serverni ishga tushirish va production build buyruqlari README’da yozilgan.

## Foydalanuvchining yangi talablari

- [ ] **Kinolar Top‑10 reytingi:** Mini-ilovada eng ko‘p ko‘rilgan va eng ko‘p qidirilgan 10 ta film asosida Top‑10 ro‘yxati bo‘lsin. Hozir haqiqiy hisoblagichlar yo‘q; demo qiymatlarni real statistika deb ko‘rsatmaslik. Backend bosqichida ko‘rishlar va qidiruvlarni haqiqatan hisoblab, ro‘yxatni shu ma’lumotlardan saralash.
- [ ] **Musiqa Top‑20 reytingi:** Eng ko‘p tinglangan va eng ko‘p qidirilgan 20 ta trek asosida Top‑20 bo‘lsin. Hozir haqiqiy hisoblagichlar yo‘q; demo qiymatlarni real statistika deb ko‘rsatmaslik. Backend bosqichida tinglash va qidiruvlarni hisoblab, ro‘yxatni shu ma’lumotlardan saralash.
- [x] **Musiqa kayfiyat to‘lqinlari (demo):** “Любовь”, “В дороге”, “Тренировка”, “Для работы”, “Хорошее настроение” va “Грустный вечер” kayfiyat bo‘limlari bor. To‘lqin bosilganda demo treklar ichidan mos metadata’li qo‘shiqlar filtrlab tavsiya qilinadi.
- [x] **Yaqinda tinglanganlar (demo):** musiqa sahifasining pastida «Недавно слушали» bo‘limi bor. U oxirgi 5 ta tanlangan demo trekni ko‘rsatadi va haqiqiy tinglash bo‘lmaganini ochiq aytadi.
- [ ] **Har filmga mos, alohida poster:** har bir haqiqiy film nomi va chiqish yili bilan rasmiy metadata manbasida qidirilsin, shu filmga mos eng tiniq mavjud poster olinib ko‘rsatilsin; boshqa filmning rasmi takroran ishlatilmasin. Noto‘g‘ri/aniq bo‘lmagan moslikda xato rasm o‘rniga demo fallback ko‘rsatilsin. TMDb API ishlatilsa image size konfiguratsiyasidan mos katta hajm tanlansin, manba attribution’i qo‘shilsin va tijorat ishlatish uchun oldindan ruxsat/litsenziya tekshirilsin; kalit faqat serverda saqlansin.
- [ ] **Foydalanuvchi rasmlari:** Foydalanuvchi yuboradigan poster va bannerlar keyin tegishli joylarga qo‘shilsin. Rasmlar kelmaguncha ularni foydalanuvchi yuborgan yoki haqiqiy katalog rasmi deb ko‘rsatmaslik; mavjud demo rasmlar vaqtinchalik.

## Keyingi backend va integratsiya bosqichlari — hali bajarilmagan

- [ ] Mavjud botni kanalga administrator qilib qo‘shgach, yangi kino/serial/musiqa postlarini indekslash; eski kanal tarixini Bot API’dan avtomatik olish imkoni yo‘qligini hisobga olib, mavjud postlar uchun alohida import/reja tuzish. Film nomi bilan qidiruv, qo‘lda tahrirlash va kanal posti/message ID bilan bog‘lashni qo‘shish.
- [ ] Haqiqiy Top‑10/Top‑20 uchun qidiruv, ko‘rish va tinglash event’larini serverda qayd etish; sevimli treklar va profil ma’lumotlarini backend bazasida saqlash.
- [ ] Ruxsatli audio manbasi va backend ulangach, “Недавно слушали”ni faqat real ijro boshlangan treklar bilan to‘ldirish; tanlangan, lekin ijro qilinmagan trekni tinglangan deb yozmaslik.
- [ ] Mood to‘lqinlaridan tavsiyalarni demo teglardan emas, keyin ulanadigan real qo‘shiq katalogi metadata’sidan hisoblash.
- [ ] Xavfsiz Telegram `initData` tekshiruvi, himoyalangan admin paneli, ruxsatli audio/video manbalari va musiqa tanish API’sini qo‘shish. Telegram postining o‘zi ommaviy HTML5 audio/video URL emas; tokenlar frontendga yoki chatga kiritilmaydi.
- [ ] Telefon qulflangandagi player boshqaruvlari uchun haqiqiy audio manba bilan Media Session API’ni tekshirish; Telegram iOS/Android WebView’larida qo‘llab-quvvatlash kafolatlanmasligini aniq aytish.
- [ ] Foydalanuvchi o‘z serveriga ko‘chira olishi uchun Docker + PostgreSQL va Windows/local/deploy qo‘llanmasini yakunlash.

## Nashr holati

- [ ] Foydalanuvchi aniq ruxsat bermaguncha public publish yoki server deploy qilinmaydi. Hozirgi ish private GitHub repository va lokal/Preview tekshiruv bilan cheklanadi.

## Второй этап — Telegram backend (2026-10-21)

- [x] Рабочий backend Telegram Bot API в существующем репозитории, без удаления кода и пересоздания проекта: webhook принимает новые и отредактированные публикации только настроенного канала; название, описание, channel_id и message_id сохраняются в PostgreSQL без дублей.
- [x] Кнопка «Получить в Telegram» открывает соответствующую публикацию в боте или канале; сервер проверяет доступ пользователя к закрытому каналу. Демо-фильмы не получают выдуманных ссылок.
- [x] Bot token, webhook secret, DATABASE_URL и API-ключи хранятся только на сервере в env, не в frontend/GitHub. Серверная проверка HMAC подписи Telegram Mini App initData, срока действия и numeric user ID; приватный каталог и admin API защищены.
- [x] Подключение PostgreSQL, миграция, API каталога, защищённый импорт старых публикаций и инструкция запуска/деплоя. Онлайн-воспроизведение не обещается без реального доступного разрешённого источника видео.
- [x] Проверить сборку, API и ошибки автоматическими тестами и локальной PostgreSQL; отправить изменения в существующий GitHub с сохранением истории, без force push.
- [ ] Реально подключить пользовательского Telegram-бота/канал и production-БД после получения username, channel ID, admin ID, защищённого bot token и данных хостинга; отдельно перечислить работающие функции и оставшуюся настройку.

### Ikkinchi bosqichning tekshirilgan chegarasi

Yuqoridagi amalga oshirilgan kod lokal PostgreSQL va ataylab belgilangan Telegram test double bilan tekshirildi: `pnpm build`, `pnpm typecheck`, 14 unit/security test va 12 integratsion test muvaffaqiyatli. HTTP orqali production rejimida frontend, `/api/health`, `/api/ready`, maxfiy sozlanmagan API xatolari tekshirildi. Secret scan va `pnpm audit --prod` toza. Mavjud fayllar o‘chirilmagan.

Haqiqiy Telegram tokeni, kanal/admin IDlari va hosting hali berilmagan; live Bot API/webhook, production PostgreSQL va Docker image build/deploy tekshirilmagan. Mini App va botning user-facing matnlari rus tilida; foydalanuvchiga izoh va sozlash qo‘llanmasi o‘zbekcha. Oldingi bo‘limlardagi ko‘p shartli kelajak punktlari ushbu bosqichda to‘liq bajarilgan deb belgilanmagan.
