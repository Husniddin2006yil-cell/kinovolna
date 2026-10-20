# Telegram kanal va mobil audio: texnik eslatmalar

Tekshirildi: 2026-10-20. Bu yozuv deploy yoki publish emas; integratsiya dizaynida saqlanadigan cheklovlar.

## Telegram kanal postlari

Bot API `channel_post` va `edited_channel_post` update turlarini beradi. Telegram’ning Bot API o‘zgarishlarida kanal postlari bo‘yicha update olish uchun bot kanal administratori bo‘lishi kerakligi ko‘rsatilgan. Bot update’lari Telegram tomonida 24 soatdan ortiq saqlanmaydi. Demak, barqaror qabul qilish uchun webhook/worker kerak; bot uzoq vaqt uzilib qolsa, ayrim update’lar qayta tiklanmasligi mumkin.

`getUpdates` webhook bilan bir vaqtda ishlamaydi. Botning mavjud webhookini bilmasdan almashtirmaslik kerak: avval token bilan faqat holatini o‘qish, so‘ng foydalanuvchi tasdiqlagandagina webhook sozlash lozim. Bot API hujjatlarida kanal tarixi uchun umumiy “history/search” metodi ko‘rsatilmagan; shu bois avtomatik indekslashni bot kanalga admin qilib qo‘yilgandan keyin keladigan yangi postlardan boshlash kerak. Eski postlarni kiritish kerak bo‘lsa, ularni qo‘lda qayta yuborish/ko‘chirish yoki ruxsatli alohida backfill usulini tanlash kerak.

Yangi kanal postining matni, caption’i, file nomi hamda mavjud audio metadata’sidan sarlavha/artistni olish mumkin. Poster, janr yoki kinoning keng metadata’sini avtomatik topish uchun alohida katalog manbasi va, ehtimol, uning API kaliti kerak. Noma’lum metadata o‘ylab topilmasin; admin paneldan qo‘lda tuzatish yo‘li bo‘lsin.

Cloud Bot API’da `getFile` orqali yuklab olish limiti 20 MB. Javobdagi download URL kamida bir soat amal qilishi mumkin va URL tarkibida bot tokeni bo‘ladi. Tokenli havola brauzer/frontendga berilmasin. Musiqa uchun telefon fonida ijro etish zarur bo‘lsa, ruxsatli audio manbasi, saqlash yoki server-proxy arxitekturasi kerak; kanal postining o‘zi xavfsiz, doimiy HTML audio oqim URL’i emas.

## Ekran qulflanganda ijro

Media Session API brauzer qo‘llaganda trek sarlavhasi, ijrochi, cover va play/pause/skip kabi OS media tugmalariga metadata/handler bera oladi. MDN uni “Limited availability” deb belgilaydi; qo‘llab-quvvatlash user agent/OS’ga bog‘liq. Telegram Mini Apps hujjatlarida Telegram ichidagi barcha iOS/Android WebView’larda fon audiosi yoki lock-screen tugmalari albatta ishlaydi degan kafolat topilmadi. Shuning uchun Mini App’da real audio manbasi bo‘lgach Media Session API’ni imkon bo‘lsa yoqib, foydalanuvchining iOS va Android Telegram ilovalarida sinash kerak. Telefon qulflanganda uzluksiz native darajadagi ishonchlilik qat’iy talab bo‘lsa, Telegram Mini App WebView’iga to‘liq tayanib bo‘lmaydi; native player yoki PWA variantini alohida baholash zarur.

## Manbalar

- [Telegram Bot API: Update](https://core.telegram.org/bots/api/types/update)
- [Telegram Bot API: getUpdates](https://core.telegram.org/bots/api/methods/getupdates)
- [Telegram Bot API: setWebhook](https://core.telegram.org/bots/api/methods/setwebhook)
- [Telegram Bot API: getFile](https://core.telegram.org/bots/api/methods/getfile)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [MDN: Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [web.dev: Media Session API](https://web.dev/articles/media-session)
