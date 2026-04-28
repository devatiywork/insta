# Instagram → Telegram bot

Telegram-бот на [grammY](https://grammy.dev) (TypeScript), который скачивает публичные посты и Reels из Instagram и отправляет медиа в чат.

## Что умеет

- Reels (видео)
- Одиночные фото / видео-посты
- Карусели (несколько фото/видео альбомом)

Реализация скрапинга — своя, без сторонних instagram-библиотек:
1. **Основная стратегия:** публичный API `instagram.com/api/v1/media/{id}/info/` с заголовком `x-ig-app-id`. Поддерживает карусели.
2. **Fallback:** парсинг embed-страницы `instagram.com/p/{code}/embed/captioned/`. Работает для одиночных фото/видео.

## Ограничения

- В 2026 Instagram **полностью закрыл анонимный доступ** к API и embed-страницам — обе стратегии возвращают login wall без сессии. Поэтому переменная `IG_COOKIES` фактически обязательна (см. шаг 2 ниже). Без неё бот ответит «Instagram требует авторизованную сессию».
- Только публичные посты. Приватные / только для подписчиков — не скачать.
- Stories не поддерживаются.
- Файлы до **50MB** (лимит стандартного Telegram Bot API). Для Reels этого хватает.
- Аккаунт под `IG_COOKIES` рискует отлететь в shadow-ban при активном использовании. **Заводи отдельный «помоечный» Instagram-аккаунт** под бота.
- Instagram периодически меняет эндпоинты — если что-то перестанет работать, смотри логи и обновляй регулярки/заголовки в `src/instagram/strategies/`.

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

Альтернатива: расширение типа **Cookie-Editor** для браузера → экспорт в формате «Header String» → одна строка готова к вставке.

### 3. Настроить `.env`

```bash
cp .env.example .env
# вписать BOT_TOKEN, IG_COOKIES, ALLOWED_USER_IDS
```

`ALLOWED_USER_IDS` — список Telegram user id через запятую, кому можно пользоваться ботом. Если оставить пустым — бот открыт всем (в логах будет warning). Свой id посмотреть у [@userinfobot](https://t.me/userinfobot).

```
ALLOWED_USER_IDS=123456789,987654321
```

### 4. Поднять через Docker

```bash
docker compose up -d
docker compose logs -f bot
```

В логах должно появиться `bot is running` с username бота.

### 5. Локальная разработка (без Docker)

```bash
npm install
npm run dev
```

## Как пользоваться

1. Найти бота в Telegram по username.
2. Отправить `/start`.
3. Отправить ссылку на пост/Reels — бот пришлёт медиа.

## Структура

```
src/
├── main.ts                       # entry point
├── config.ts                     # env-конфиг
├── logger.ts                     # pino
├── bot/
│   ├── bot.ts                    # grammY Bot, middleware
│   ├── allowlist.ts              # фильтрация по ALLOWED_USER_IDS
│   └── handlers/
│       ├── start.ts              # /start, /help
│       └── message.ts            # обработка ссылок
└── instagram/
    ├── types.ts
    ├── url-parser.ts             # извлечение shortcode из URL
    ├── shortcode.ts              # shortcode → media_id (BigInt)
    ├── http.ts                   # fetch с retry и ротацией UA
    ├── scraper.ts                # фасад: api → embed fallback
    ├── send-media.ts             # отправка фото/видео/альбомов
    └── strategies/
        ├── api.ts                # стратегия 1: публичный API
        └── embed.ts              # стратегия 2: embed-страница
```

## Полезные команды

```bash
npm run typecheck    # проверка типов без сборки
npm run build        # tsc → dist/
npm run dev          # горячая перезагрузка через tsx
docker compose down  # остановить
docker compose pull  # обновить образы
```
