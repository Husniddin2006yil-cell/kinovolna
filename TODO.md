# TurboMedia — TODO

## 1-bosqich: TurboMedia interfeysi va prototip

- [x] **Asosiy ekranlar va vizual prototip:** TurboMedia nomli Telegram Mini App loyihasi uchun avval ko‘rgazmali, ishlaydigan interfeys prototipi yaratildi. U desktop va mobil brauzer uchun mos; qora/to‘q kulrang fon, firuza-neon aksentlar, original kino tasvirlari, yumaloq kartalar va silliq animatsiyalardan foydalanadi. Interfeys rus tilida.
- [x] **Bosh sahifa:** TurboMedia belgisi, qidiruv, tavsiya etilgan kontent, filmlar/seriallar, musiqa tavsiyasi va yaqinda qo‘shilgan serial kartasi bor.
- [x] **Moslashuvchan navigatsiya:** Главная, Музыка, Кино, Поиск ва Профиль бўлимлари учун desktop navigatsiyasi hamda mobil pastki panel mavjud.
- [x] **Film va serial katalogi:** Poster, nom, yil, janr, tavsif, qidiruv, kategoriyalar va mashhur/yangi filtrlari bilan katalog mavjud.
- [x] **Kontent tafsilotlari:** Alоҳида film/serial sahifasi, tavsif, reyting, yil, janr, sevimli tugmasi va serial epizodlari ro‘yxati mavjud.
- [x] **Telegram va onlayn tomosha holatlari:** «Получить в Telegram» va «Смотреть онлайн» tugmalari demo holatda tushuntirish beradi. Bot ulanishi va video oqimi mavjud deb yolg‘on ko‘rsatilmaydi; soxta media URL yo‘q.
- [x] **Musiqa bo‘limi:** Trek qidiruvi, namunaviy playlistlar, ijrochi kartalari/sahifasi, mashhur treklar va sevimli trek filtri mavjud.
- [x] **Audio player interfeysi:** Pastki mini-player va kengaytiriladigan to‘liq player oynasi boshqaruv elementlari bilan mavjud. Audio manbasi yo‘qligi ochiq ko‘rsatiladi; real audio ulangan deb ko‘rsatilmaydi.
- [x] **Musiqani tanish holati:** Haqiqiy recognition servisi ulanmagani uchun ishlab chiqilayotgani ko‘rsatiladi; mikrofon yozuvi va tasodifiy natija yo‘q.
- [x] **Profil:** Demo Telegram profil ko‘rinishi, saqlangan filmlar/treklar, ko‘rish tarixi va xavfsizlik izohi mavjud; Telegram paroli so‘ralmaydi.
- [x] **Holatlar, moslashuv va tuzilma:** Yuklanish animatsiyasi, bo‘sh qidiruv/sevimlilar holati, xato banneri, silliq animatsiyalar, ruscha moslashuvchan dizayn, React + Vite tuzilmasi va Windows yo‘riqnomasi mavjud.

## Keyingi bosqichlar — bajarilishi kutilmoqda

- [ ] Telegram kanalini indekslash, backend/ma’lumotlar bazasi, mavjud bot bilan integratsiya, haqiqiy video/audio oqimlari, musiqa tanish servisi va himoyalangan admin paneli keyin ulanadi. Bot tokeni yoki API kalitlari chatga yuborilmaydi; kerak bo‘lganda himoyalangan secret input yoki gitignore’da qoladigan lokal `.env` ishlatiladi.
