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

- Только публичные посты. Приватные / только для подписчиков — не скачать.
- Stories не поддерживаются (требуют авторизованной сессии).
- Файлы до **50MB** (лимит стандартного Telegram Bot API). Для Reels этого хватает.
- Instagram периодически меняет эндпоинты — если оба способа сломаются, посмотри логи и обнови регулярки/заголовки в `src/instagram/strategies/`.

## Запуск

### 1. Получить токен бота

У [@BotFather](https://t.me/BotFather): `/newbot` → имя → username (заканчивается на `bot`) → получишь `BOT_TOKEN`.

### 2. Настроить `.env`

```bash
cp .env.example .env
# вписать BOT_TOKEN
```

### 3. Поднять через Docker

```bash
docker compose up -d
docker compose logs -f bot
```

В логах должно появиться `bot is running` с username бота.

### 4. Локальная разработка (без Docker)

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
