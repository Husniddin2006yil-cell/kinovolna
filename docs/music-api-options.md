# КИНОВОЛНА: musiqa, Shazam va film poster API’lari

**Tekshirilgan sana: 2026-10-21.** Katalog ma’lumoti, audio ijrosi, qo‘shiqni tanish va film posterlari alohida xizmatlar bo‘lishi mumkin. Bitta API ularning hammasini avtomatik hal qilmaydi.

## Qo‘shiqlarni tanish

КИНОВОЛНА Telegram Mini App sifatida web muhitida ishlaydi. Shazam’ning rasmiy **ShazamKit** hujjatlari Apple platformalari va Android uchun native SDK’larni ko‘rsatadi. Android varianti Gradle/AAR kutubxonasi hamda developer token talab qiladi. Hujjatlarda brauzer uchun JavaScript SDK ko‘rsatilmagan, shu sabab Mini App’ga to‘g‘ridan-to‘g‘ri ShazamKit qo‘shish qulay yo‘l emas.[1] [2]

Birinchi sinov uchun **AudD** API’ni backend orqali ulashni tavsiya qilaman. U audio fayl, audio URL yoki qisqa yuklangan yozuvni qabul qilib, ijrochi, qo‘shiq nomi va mavjud metadata’ni qaytaradi. Rasmiy sahifada dastlabki 300 so‘rov bepul, keyingi oddiy tanish so‘rovlari taxminan $2–$5 / 1 000 deb ko‘rsatilgan; ulashdan oldin tarifni qayta tekshiramiz. **ACRCloud** muqobil: u mikrofon/fayl tanishi, o‘z katalogini tanish va ayrim holatlarda humming/cover tanishini qo‘llaydi. Uning rasmiy qo‘llanmasi host, access key va access secret talab qilishini, pricing sahifasi esa hisobga kirishni talab qilishini bildiradi.[3] [4] [5]

AudD yoki ACRCloud natijasi audiofaylni ijro qilish ruxsati degani emas. API tokenlari keyinchalik faqat backend secret’ida saqlanadi; brauzer kodi yoki Telegram chatiga qo‘yilmaydi. Hozir bu loyiha bosqichida token kerak emas.

## Qo‘shiqlarni ijro etish

Haqiqiy player uchun foydalanuvchida ijro va tarqatish huquqi bo‘lgan audio kerak: masalan, o‘zingizga tegishli yoki litsenziyalangan fayllar/oqimlar. Telegram kanal postini indekslashning o‘zi Mini App uchun ommaviy HTML5 audio URL bermaydi.[1] [3] [5]

**Apple MusicKit** rasmiy API’si katalog qidiruvi va foydalanuvchi ruxsati bilan web’da audio ijrosini qo‘llaydi. To‘liq Apple Music katalogini ijro qilishdan oldin foydalanuvchi hisobidagi obuna/huquq tekshiriladi.[6] **Spotify Web API** metadata va playback’ni boshqarishi mumkin; brauzerdagi **Web Playback SDK** audio ijrosi uchun Premium hisob talab qiladi. Spotify hujjatida SDK’ni tijorat loyihasida ishlatishdan oldin yozma ruxsat olish kerakligi aytiladi, shuning uchun Spotify’ni istalgan ilova uchun bepul audio hosting deb hisoblamaslik kerak.[7] [8] [9]

## Film nomiga mos posterlar

**TMDb API** film nomi va chiqarilgan yil bo‘yicha qidiruv natijasida `poster_path` qaytaradi. Rasm URL’i API konfiguratsiyasidagi `base_url` va o‘lchamni shu yo‘lga qo‘shib tuziladi; aniq o‘lchamlar `/configuration` javobidan olinadi. Har bir haqiqiy film uchun nom+yil bilan qidirib, mosligi tasdiqlangan posterning eng katta mos variantini ishlatish mumkin. Nomi mos kelmaydigan yoki aniqligi shubhali rasmni ko‘rsatmaymiz.[10] [11] [12]

Muhim litsenziya sharti: TMDb API oddiy developer foydalanishida faqat notijorat loyiha va TMDb attribution’i bilan bepul. Loyihadan daromad olinadigan tijorat holatida TMDb bilan alohida yozma kelishuv talab qilinadi. Shuning uchun real publikka chiqarishdan oldin ilovaning tijorat holati va foydalanish huquqi tasdiqlanadi; tasdiqsiz posterlarni ommaviy ishlatmaymiz.[11] [12]

Hozirgi katalogdagi film nomlari hozircha demo namunalari; ularga internetdan tasodifiy nomdosh film rasmi ulansa noto‘g‘ri ko‘rinadi. Haqiqiy Telegram postlari va film nomlari kelgach, backend nom+yil bo‘yicha qidirib har filmga alohida rasm bog‘laydi; manba topilmasa aniq demo fallback qoladi. Google Images’dan avtomatik ko‘chirib olish o‘rniga API va ruxsatni tekshirish kerak.

## КИНОВОЛНА uchun navbatdagi ulash tartibi

1. Avval backend/server va ma’lumotlar bazasi bo‘yicha foydalanuvchi tasdig‘i olinadi.
2. Shazam-uslubidagi aniqlash uchun AudD’ni boshlang‘ich nomzod, ACRCloud’ni muqobil variant sifatida qoldiramiz. Foydalanuvchi bittasini tanlagach, kerakli kalit himoyalangan secret input’da olinadi.
3. Audio ijrosi uchun alohida litsenziyalangan audio manbasi, film posterlari uchun esa loyiha foydalanish holatiga mos ruxsatli metadata/image provayderi tanlanadi.
4. Haqiqiy nom, yil va media manbasi bo‘lmaguncha poster, audio va top reytinglar demo deb belgilanadi; statistik reytinglar serverdagi qidiruv, ko‘rish va tinglash event’laridan hisoblanadi.

## Manbalar

[1]: https://developer.apple.com/shazamkit/ "Apple ShazamKit"
[2]: https://developer.apple.com/shazamkit/android/ "ShazamKit for Android"
[3]: https://docs.audd.io/ "AudD API Documentation"
[4]: https://audd.io/ "AudD Music Recognition API and pricing"
[5]: https://docs.acrcloud.com/get-started/tutorials/recognize-music "ACRCloud Recognize Music"
[6]: https://developer.apple.com/musickit/ "Apple MusicKit"
[7]: https://developer.spotify.com/documentation/web-api "Spotify Web API"
[8]: https://developer.spotify.com/documentation/web-playback-sdk "Spotify Web Playback SDK"
[9]: https://developer.spotify.com/terms "Spotify Developer Terms"
[10]: https://developer.themoviedb.org/reference/search-movie "TMDb Search Movies API"
[11]: https://developer.themoviedb.org/docs/image-basics "TMDb Image Basics and sizes"
[12]: https://developer.themoviedb.org/docs/faq "TMDb API FAQ and attribution"


## Hozirgi tanlangan audio manbasi — Wikimedia Commons (2026-10-22)

Musiqa qidiruvi server orqali Wikimedia Commons MediaWiki API’dan ishlaydi: fayllar `generator=search`, `gsrnamespace=6` va `filetype:audio` so‘rovi bilan topiladi. Avval URL/MIME kabi yengil maydonlar olinadi; ko‘pi bilan 20 mos audiofayl uchun `imageinfo` hamda kerakli `extmetadata` maydonlari (`Artist`, `ObjectName`, `LicenseShortName`, `LicenseUrl`, `Credit`) alohida olinadi. Rasmiy API hujjati `extmetadata` so‘rovi qimmat ekanini, shu sabab faqat kerakli fayllarda va imkon qadar kam ishlatilishini aytadi. Backend javobi besh daqiqa xotirada keshlanadi va endpoint har IP uchun daqiqasiga 30 so‘rov bilan cheklanadi. API kaliti frontendda yoki server sozlamalarida talab qilinmaydi.

Qidiruv natijasiga faqat HTTPS’dagi Wikimedia fayl sahifasi va to‘g‘ridan-to‘g‘ri audio URL’i bor, brauzerda qo‘llab-quvvatlanadigan MP3/M4A/AAC/WAV MIME turi, muallif/credit hamda litsenziya metama’lumoti mavjud fayl qo‘shiladi. Hozir avtomatik filtrlash `Public Domain`/`Public Domain Mark`, CC0, CC BY va CC BY-SA’ni qabul qiladi; NC (notijorat) va ND (hosila ishlarni taqiqlash) variantlarini qabul qilmaydi. Har bir trek qatorida ijrochi, Commons fayl sahifasi va litsenziya havolasi ko‘rinadi. Dastlabki ikkita tarixiy namunada Public Domain Mark 1.0 ko‘rsatiladi; bu CC0 bilan bir xil litsenziya emas.

**Chegara:** Wikimedia Commons mashhur tijorat katalogi yoki kafolatlangan zamonaviy qo‘shiqlar sayti emas. Fayl sahifasidagi huquqiy ma’lumotni loyiha egasi alohida tekshirishi kerak; Wikimedia o‘zi metadata to‘g‘riligiga kafolat bermasligini bildiradi. Shuning uchun qidiruv “hamma qo‘shiqlar bepul” degani emas. Litsenziyaga rioya qilish, mualliflik attribution’i va hududiy/non-copyright cheklovlari foydalanuvchining yakuniy foydalanish holatiga bog‘liq. iPhone/Telegram WebView’da ekran qulflanganda ijro Media Session orqali imkon qadar qo‘llab-quvvatlanadi, ammo qurilma va Telegram siyosati sabab kafolatlanmaydi; haqiqiy iPhone lock-screen sinovi bu sandbox sinovining o‘rnini bosa olmaydi.

Rasmiy manbalar: [13] Wikimedia Commons MediaWiki API misollari; [14] MediaWiki Search API; [15] MediaWiki Imageinfo/`extmetadata`; [16] Wikimedia Commons tashqarida qayta foydalanish yo‘riqnomasi.

[13]: https://commons.wikimedia.org/wiki/Commons:API/MediaWiki "Wikimedia Commons MediaWiki API examples"
[14]: https://www.mediawiki.org/wiki/API:Search "MediaWiki API: Search"
[15]: https://www.mediawiki.org/wiki/API:Imageinfo "MediaWiki API: Imageinfo"
[16]: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia "Wikimedia Commons reuse guidance"
