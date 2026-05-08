# Instagram + TikTok → Telegram bot

Telegram-бот на [grammY](https://grammy.dev) (TypeScript), который скачивает публичные посты, Reels из Instagram и видео/фото-слайдшоу из TikTok и отправляет медиа в чат.

## Что умеет

**Instagram:**
- Reels (видео)
- Одиночные фото / видео-посты
- Карусели (несколько фото/видео альбомом)

**TikTok:**
- Видео (без watermark)
- Фото-слайдшоу (отправляются альбомом)
- Короткие ссылки (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/...`)

Реализация скрапинга — своя, без сторонних библиотек:

**Instagram:**
1. **Основная стратегия:** публичный API `instagram.com/api/v1/media/{id}/info/` с заголовком `x-ig-app-id`. Поддерживает карусели.
2. **Fallback:** парсинг embed-страницы `instagram.com/p/{code}/embed/captioned/`. Работает для одиночных фото/видео.

**TikTok:**
- HTML-страница `tiktok.com/@user/video/{id}` (или `/photo/{id}`) → парсится JSON из `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">`. Достаются `video.bitrateInfo[].PlayAddr` (без watermark) или `imagePost.images[]` для слайдшоу.
- При скачивании видео по `playAddr` посылаем те же `User-Agent`, `Referer` и `Cookie`, что использовали при парсинге страницы — иначе CDN отдаёт 403 (`ttwid`/`tt_chain_token` привязаны к сессии).

## Ограничения

- В 2026 Instagram **полностью закрыл анонимный доступ** к API и embed-страницам — обе стратегии возвращают login wall без сессии. Поэтому `IG_COOKIES` фактически обязательна.
- TikTok работает анонимно для большинства публичных постов, но IP может попасть под капчу/флаг — на этот случай `TIKTOK_COOKIES` (опциональная).
- Только публичные посты. Приватные / только для подписчиков — не скачать.
- Stories не поддерживаются.
- Файлы до **50MB** (лимит стандартного Telegram Bot API). Для большинства Reels и TikTok этого хватает.
- Аккаунт под куки рискует отлететь в shadow-ban при активном использовании. **Заводи отдельный «помоечный» аккаунт** под бота на каждой платформе.
- Платформы периодически меняют структуру/эндпоинты — если что-то перестанет работать, смотри логи и обновляй регулярки/селекторы в `src/instagram/strategies/` и `src/tiktok/strategies/`.

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
# вписать BOT_TOKEN, IG_COOKIES, TIKTOK_COOKIES (опц.), ALLOWED_USER_IDS
```

`ALLOWED_USER_IDS` — список Telegram user id через запятую, кому можно пользоваться ботом. Если оставить пустым — бот открыт всем (в логах будет warning). Свой id посмотреть у [@userinfobot](https://t.me/userinfobot).

```
ALLOWED_USER_IDS=123456789,987654321
```

### 5. Поднять через Docker

```bash
docker compose up -d
docker compose logs -f bot
```

В логах должно появиться `bot is running` с username бота.

### 6. Локальная разработка (без Docker)

```bash
npm install
npm run dev
```

## Как пользоваться

1. Найти бота в Telegram по username.
2. Отправить `/start`.
3. Отправить ссылку на пост Instagram или TikTok — бот пришлёт медиа.

## Структура

```
src/
├── main.ts                       # entry point
├── config.ts                     # env-конфиг
├── logger.ts                     # pino
├── http.ts                       # общий fetch с retry и ротацией UA
├── bot/
│   ├── bot.ts                    # grammY Bot, middleware
│   ├── allowlist.ts              # фильтрация по ALLOWED_USER_IDS
│   └── handlers/
│       ├── start.ts              # /start, /help
│       └── message.ts            # обработка ссылок
├── media/
│   ├── types.ts                  # MediaItem, ScrapeResult, ошибки
│   ├── send-media.ts             # отправка фото/видео/альбомов в TG
│   └── dispatch.ts               # детект платформы + роутинг скрапера
├── instagram/
│   ├── url-parser.ts             # извлечение shortcode из URL
│   ├── shortcode.ts              # shortcode → media_id (BigInt)
│   ├── session.ts                # анонимная сессия / IG_COOKIES
│   ├── scraper.ts                # фасад: api → embed fallback
│   └── strategies/
│       ├── api.ts                # стратегия 1: публичный API
│       └── embed.ts              # стратегия 2: embed-страница
└── tiktok/
    ├── url-parser.ts             # детект/резолв коротких ссылок, парсинг id
    ├── session.ts                # анонимная сессия / TIKTOK_COOKIES
    ├── scraper.ts                # фасад
    └── strategies/
        └── web.ts                # парсинг __UNIVERSAL_DATA_FOR_REHYDRATION__
```

## Полезные команды

```bash
npm run typecheck    # проверка типов без сборки
npm run build        # tsc → dist/
npm run dev          # горячая перезагрузка через tsx
docker compose down  # остановить
docker compose pull  # обновить образы
```
