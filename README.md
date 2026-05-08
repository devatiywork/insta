# Instagram + TikTok + YouTube → Telegram bot

Telegram-бот на [grammY](https://grammy.dev) (TypeScript), который скачивает публичные посты из Instagram, TikTok и YouTube и отправляет медиа в чат.

## Что умеет

**Instagram:**
- Reels (видео)
- Одиночные фото / видео-посты
- Карусели (несколько фото/видео альбомом)

**TikTok:**
- Видео (без watermark)
- Фото-слайдшоу (отправляются альбомом)
- Короткие ссылки (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/...`)

**YouTube:**
- Обычные видео и Shorts
- `youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, `m.youtube.com`, `music.youtube.com`
- Качается через `yt-dlp` — обходит сигнатуры/PoToken «из коробки»

**Аудио-экстракт (все платформы):**
- Под одиночным видео появляется кнопка **🎵 Аудио** — извлекает звуковую дорожку
- Команда `/audio <ссылка>` — то же самое для случаев, когда кнопки нет (карусель, фото-слайдшоу)
- TikTok отдаёт оригинальный mp3 музыки автора, IG/YouTube — `ffmpeg` без перекодирования

**Доступ и настройки:**
- Роли: админ (из env) и обычные пользователи (добавляет админ через бота).
- Незнакомец видит свой Telegram ID и просьбу передать админу.
- Админ может добавить юзера через `/add` или кнопку «👤 Добавить» (ID числом или форвард сообщения), удалить через `/users`/«👥 Список» с inline-кнопкой удаления.
- Любой пользователь может включить/выключить подписи к контенту индивидуально для Instagram, TikTok и YouTube через `/settings` или кнопку «⚙️ Настройки». Если выключено — приходит только медиа без текста.
- Админу доступен `/stats` — топ юзеров, разбивка по платформам, последние ошибки.

**Хранилище:**
- SQLite (`better-sqlite3`) в файле, заданном `DB_PATH` (по умолчанию `data/bot.db`).
- В Docker лежит на named volume `bot-data` — переживает `--build`.
- При миграции со старой версии бот автоматически забирает данные из `data/storage.json` (если есть) и переименовывает его в `storage.json.migrated`.

Реализация скрапинга — своя для IG/TikTok, через `yt-dlp` для YouTube:

**Instagram:**
1. **Основная стратегия:** публичный API `instagram.com/api/v1/media/{id}/info/` с заголовком `x-ig-app-id`. Поддерживает карусели.
2. **Fallback:** парсинг embed-страницы `instagram.com/p/{code}/embed/captioned/`. Работает для одиночных фото/видео.

**TikTok:**
- HTML-страница `tiktok.com/@user/video/{id}` (или `/photo/{id}`) → парсится JSON из `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">`. Достаются `video.bitrateInfo[].PlayAddr` (без watermark) или `imagePost.images[]` для слайдшоу. Музыка `music.playUrl` — для аудио-экстракта.
- При скачивании видео по `playAddr` посылаем те же `User-Agent`, `Referer` и `Cookie`, что использовали при парсинге страницы — иначе CDN отдаёт 403 (`ttwid`/`tt_chain_token` привязаны к сессии).

**YouTube:**
- `yt-dlp` запускается subprocess'ом, формат-селектор `best[filesize<=49M]/...` ограничивает до 50 МБ TG-лимита.
- Для аудио — `yt-dlp -x --audio-format m4a`.
- `ffmpeg` нужен для merge DASH-стримов и extract'а аудио из IG/TT-видео.

## Ограничения

- В 2026 Instagram **полностью закрыл анонимный доступ** к API и embed-страницам — обе стратегии возвращают login wall без сессии. Поэтому `IG_COOKIES` фактически обязательна.
- TikTok работает анонимно для большинства публичных постов, но IP может попасть под капчу/флаг — на этот случай `TIKTOK_COOKIES` (опциональная).
- YouTube работает анонимно для публичных видео. Age-restricted и member-only требуют куки (пока не реализовано — добавлю если упрёшься).
- Только публичные посты. Приватные / только для подписчиков — не скачать.
- Stories не поддерживаются.
- Файлы до **50 МБ** (лимит стандартного Telegram Bot API). Длинные YouTube-видео могут не поместиться → ошибка «слишком большое».
- Аккаунт под куки рискует отлететь в shadow-ban при активном использовании. **Заводи отдельный «помоечный» аккаунт** под бота на каждой платформе.
- Платформы периодически меняют структуру/эндпоинты — если что-то перестанет работать, смотри логи и обновляй регулярки/селекторы в `src/instagram/strategies/` и `src/tiktok/strategies/`. Для YouTube — обновить yt-dlp (`docker compose up -d --build`).

## Запуск

### 1. Получить токен бота

У [@BotFather](https://t.me/BotFather): `/newbot` → имя → username (заканчивается на `bot`) → получишь `BOT_TOKEN`.

### 2. Получить cookies от Instagram

> Заводи **отдельный левый аккаунт** Instagram. Не используй личный — есть риск shadow-ban.

1. Залогинься на <https://www.instagram.com/> в обычном браузере (Chrome / Firefox).
2. Открой DevTools (`F12`) → вкладка **Application** (Chrome) или **Storage** (Firefox) → **Cookies** → `https://www.instagram.com`.
3. Скопируй значения этих cookies:
   - `sessionid` — главный, без него никак
   - `csrftoken` — нужен для CSRF-защиты API
   - `ds_user_id` — желательно
   - `mid`, `ig_did` — опционально, но не помешают
4. Собери в одну строку через `; ` и положи в `IG_COOKIES`:
   ```
   IG_COOKIES=csrftoken=XXX; sessionid=YYY; ds_user_id=ZZZ; mid=AAA; ig_did=BBB
   ```

Альтернатива: расширение **Cookie-Editor** для браузера → экспорт в формате «Header String» → одна строка готова к вставке.

### 3. Получить cookies от TikTok (опционально)

> Опциональная, но рекомендуется. Без неё бот пытается работать анонимно — обычно хватает, но при росте нагрузки или с флагнутого IP CDN начнёт отдавать 403/капчу.

1. Залогинься на <https://www.tiktok.com/> в браузере (отдельный аккаунт!).
2. DevTools → **Cookies** → `https://www.tiktok.com`.
3. Скопируй как минимум:
   - `sessionid` — главный
   - `tt_csrf_token` — для CSRF
   - `ttwid`, `tt_chain_token` — без них CDN видео может отдать 403
   - `msToken`, `sid_tt`, `sid_guard` — желательно
4. Собери в одну строку:
   ```
   TIKTOK_COOKIES=sessionid=...; tt_csrf_token=...; ttwid=...; tt_chain_token=...; msToken=...
   ```

Проще всего — расширение **Cookie-Editor** → формат «Header String».

### 4. Настроить `.env`

```bash
cp .env.example .env
# вписать BOT_TOKEN, IG_COOKIES, TIKTOK_COOKIES (опц.), ADMIN_USER_IDS
```

`ADMIN_USER_IDS` — список Telegram user id через запятую, минимум один. Админы всегда имеют доступ и могут добавлять/удалять остальных пользователей через бота. Свой id посмотреть у [@userinfobot](https://t.me/userinfobot).

```
ADMIN_USER_IDS=123456789
```

`DB_PATH` — где бот хранит SQLite (`bot.db`). По умолчанию `data/bot.db`, в Docker — `/app/data/bot.db` на named-volume `bot-data` (переживает `--build`). Заглянуть/забэкапить:

```bash
docker compose exec bot sqlite3 /app/data/bot.db .schema
docker compose cp bot:/app/data/bot.db ./bot-backup.db
```

### 5. Поднять через Docker

```bash
docker compose up -d --build
docker compose logs -f bot
```

В логах должно появиться `bot is running` с username бота.

> Образ ставит ffmpeg + Python + yt-dlp + sqlite (build-tools для нативной сборки) — первый build занимает 1-2 минуты. Если y t-dlp начал ломаться на YouTube — `docker compose up -d --build` тянет свежий yt-dlp.

### 6. Локальная разработка (без Docker)

Локально нужны установленные `ffmpeg` и `yt-dlp` в PATH (через `pip install yt-dlp` и пакет ffmpeg из системы).

```bash
npm install
npm run dev
```

## Как пользоваться

1. Найти бота в Telegram по username.
2. Отправить `/start`. Если ID есть в `ADMIN_USER_IDS` — увидишь админ-меню. Если нет — бот покажет твой ID и попросит передать админу.
3. Отправить ссылку на пост Instagram, TikTok или YouTube — бот пришлёт медиа.
4. Под одиночным видео — кнопка **🎵 Аудио** для извлечения звука. Для каруселей/слайдшоу: `/audio <ссылка>`.

### Команды

Все:
- `/start` — приветствие
- `/help` — справка
- `/settings` — подписи к медиа (включить/выключить отдельно для Instagram, TikTok, YouTube)
- `/audio <ссылка>` — извлечь только аудио (или ответом `/audio` на сообщение со ссылкой)

Админ:
- `/add` или кнопка «👤 Добавить» — добавить пользователя (ID числом или форвард его сообщения)
- `/users` или «👥 Список» — список пользователей с кнопкой удаления
- `/stats` — статистика (топ юзеров, ошибки)
- `/cancel` — отменить ввод во время `/add`

## Структура

```
src/
├── main.ts                       # entry point, грузит DB и стартует бота
├── config.ts                     # env-конфиг
├── logger.ts                     # pino
├── http.ts                       # общий fetch с retry и ротацией UA
├── db.ts                         # SQLite: schema, миграция из storage.json
├── storage.ts                    # CRUD allowed_users / user_prefs
├── stats.ts                      # CRUD downloads / errors + summary
├── bot/
│   ├── bot.ts                    # grammY Bot, middleware, регистрация хендлеров
│   ├── access.ts                 # роли (admin/allowed), middleware-гейт
│   ├── keyboards.ts              # reply- и inline-клавиатуры
│   ├── audio-cache.ts            # in-memory map shortId → {url, platform}
│   └── handlers/
│       ├── start.ts              # /start, /help, ролевые меню
│       ├── settings.ts           # /settings, тогглы подписей
│       ├── stats.ts              # /stats для админа
│       ├── audio.ts              # callback 🎵 + /audio
│       ├── admin.ts              # /add, /users, /cancel + state-машина
│       └── message.ts            # обработка ссылок, stats, audio button
├── media/
│   ├── types.ts                  # MediaItem, ScrapeResult, ошибки, AudioInfo
│   ├── send-media.ts             # отправка фото/видео/альбомов в TG
│   ├── audio.ts                  # ffmpeg / yt-dlp audio extraction
│   └── dispatch.ts               # детект платформы + роутинг скрапера
├── instagram/
│   ├── url-parser.ts             # извлечение shortcode из URL
│   ├── shortcode.ts              # shortcode → media_id (BigInt)
│   ├── session.ts                # анонимная сессия / IG_COOKIES
│   ├── scraper.ts                # фасад: api → embed fallback
│   └── strategies/
│       ├── api.ts                # стратегия 1: публичный API
│       └── embed.ts              # стратегия 2: embed-страница
├── tiktok/
│   ├── url-parser.ts             # детект/резолв коротких ссылок, парсинг id
│   ├── session.ts                # анонимная сессия / TIKTOK_COOKIES
│   ├── scraper.ts                # фасад
│   └── strategies/
│       └── web.ts                # парсинг __UNIVERSAL_DATA_FOR_REHYDRATION__
└── youtube/
    ├── url-parser.ts             # детект YouTube URL
    └── scraper.ts                # обёртка вокруг yt-dlp
```

## Полезные команды

```bash
npm run typecheck    # проверка типов без сборки
npm run build        # tsc → dist/
npm run dev          # горячая перезагрузка через tsx
docker compose down  # остановить
docker compose pull  # обновить образы
```
