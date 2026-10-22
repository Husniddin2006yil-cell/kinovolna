# TMDB treylerlari

Mini App kino tafsilotlaridagi «Смотреть трейлер» tugmasi TMDB film/serial video endpointidan natija qidiradi. Server faqat `site=YouTube` bo‘lgan, 11 belgili xavfsiz video kalitiga ega Trailer yoki Teaser yozuvini qaytaradi; rasmiy video ustuvor. TMDB API kaliti faqat backendda qoladi. Treyler `youtube-nocookie.com` iframe orqali shu sahifada ochiladi.

TMDB endpointi video faylni bermaydi — video kaliti va tavsif metama’lumotlarini beradi. Shu sababli Telegram Bot API orqali video faylini o‘qishdagi 20 MB chegarasi TMDB/YouTube iframe oqimiga tatbiq etilmaydi. Iframe oqimining hajmini 18 MB yoki boshqa aniq qiymatga cheklab bo‘lmaydi. Treyler TMDB natijasida bo‘lmasa, tugma xato holatini ko‘rsatadi; soxta media URL ishlatilmaydi.

Rasmiy manbalar:

- [TMDB movie videos endpoint](https://developer.themoviedb.org/reference/movie-videos)
- [TMDB API FAQ](https://developer.themoviedb.org/docs/faq)
- [TMDB API terms of use](https://www.themoviedb.org/api-terms-of-use)
