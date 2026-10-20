# КИНОВОЛНА uchun hosting tavsiyasi

## Tavsiya

Hozircha deploy qilmaymiz. Yakuniy bosqichda eng sodda managed variant sifatida **Railway + PostgreSQL**, katta ruxsatli audiofayllar va coverlar uchun esa **Cloudflare R2**ni ko‘rib chiqish ma’qul. Railway GitHub repository’ni service source qilib bog‘laydi va tanlangan branch’ga yangi commit tushganda avtomatik build/deploy qiladi; Railway services API va database kabi doimiy ishlaydigan xizmatlar uchun mo‘ljallangan. Railway’da PostgreSQL’ni alohida service sifatida qo‘shib, `DATABASE_URL` orqali Node backendga ulash mumkin. GitHub’ni Railway’ga faqat finalga yaqin, har bir push avtomatik deploy bo‘lib ketmasligi kerak bo‘lgan paytda ulaymiz.

Render ham GitHub + Node service + PostgreSQL beradi, lekin free web service 15 daqiqa trafik bo‘lmasa o‘chib turadi, free PostgreSQL 1 GB bilan cheklangan va 30 kundan keyin tugaydi. Shu sababli u sinov uchun yarashi mumkin, ammo doimiy Telegram webhooki va production katalogi uchun bepul rejani tanlamaslik kerak.

Agar foydalanuvchida allaqachon VPS bo‘lsa va server boshqaruvi maqbul bo‘lsa, Docker Compose orqali Node API + PostgreSQL o‘sha serverda yurishi mumkin. Bu portativlikni saqlaydi, lekin TLS, firewall, backup, update va monitoring egasining zimmasida bo‘ladi. Cloudflare Workers + D1 + R2 esa alohida server boshqaruvini kamaytiradi, lekin Node/Express + PostgreSQL loyihasini Workers/D1 arxitekturasiga moslashtirishni talab qiladi; hozircha tavsiya etilgan oddiy stack emas.

## Media va Telegram bilan bog‘liq chegaralar

Cloud Bot API’dan `getFile` orqali fayl yuklab olish 20 MB bilan cheklangan; qaytgan file URL tokenni o‘z ichiga oladi va server tomonda qolishi kerak. Kanal postini foydalanuvchiga Telegram’da yuborish boshqa yo‘l, Mini App ichida uzluksiz audio/video oqimlash esa alohida ruxsatli storage yoki stream manbasini talab qiladi. Audiofayl va video faqat tarqatish huquqi bo‘lsa saqlanadi/uzatiladi. Trafik va media hajmi hozir noma’lum bo‘lgani uchun R2 yoki boshqa storage’ni tanlashdan oldin taxminiy hajmni aniqlash kerak.

Ekran qulflanganda web player `Media Session API` orqali metadata va media tugmalarini berishi mumkin, lekin API hamma brauzer/WebView’da bir xil ishlamaydi. Telegram ichida iOS va Android’da real audio qo‘shilgach alohida sinash kerak. Kafolatli fon ijrosi mutlaq talab bo‘lsa, keyin alohida native-app variantini baholaymiz.

## Rasmiy manbalar

- [Railway services va GitHub deploy](https://docs.railway.com/services)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway tariflari](https://docs.railway.com/pricing/plans)
- [Render first deploy](https://render.com/docs/your-first-deploy)
- [Render free xizmatlari va cheklovlari](https://render.com/docs/free)
- [Cloudflare Workers GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Telegram Bot API getFile](https://core.telegram.org/bots/api/methods/getfile)
- [MDN Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
