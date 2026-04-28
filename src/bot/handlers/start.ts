import type { Bot } from "grammy";

const WELCOME = `👋 Привет! Я скачиваю контент из Instagram.

Просто отправь мне ссылку на пост или Reels, и я пришлю фото/видео обратно.

Поддерживаемые ссылки:
• <code>instagram.com/p/{shortcode}</code>
• <code>instagram.com/reel/{shortcode}</code>
• <code>instagram.com/reels/{shortcode}</code>
• <code>instagram.com/share/{shortcode}</code>

⚠️ Бот работает только с публичными постами.`;

const HELP = `Отправь ссылку на публичный пост Instagram (фото, видео или карусель) — я пришлю медиа обратно.

Команды:
/start — приветствие
/help — эта справка`;

const REPLY_OPTS = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true },
};

export function registerStart(bot: Bot): void {
  bot.command("start", (ctx) => ctx.reply(WELCOME, REPLY_OPTS));
  bot.command("help", (ctx) => ctx.reply(HELP, REPLY_OPTS));
}
