import type { Bot } from "grammy";

const WELCOME = `👋 Привет! Я скачиваю контент из Instagram.

Просто отправь мне ссылку на пост или Reels, и я пришлю фото/видео обратно.

Поддерживаемые ссылки:
• https://instagram.com/p/<id>/
• https://instagram.com/reel/<id>/
• https://instagram.com/reels/<id>/
• https://instagram.com/share/<id>/

⚠️ Бот работает только с публичными постами.`;

const HELP = `Отправь ссылку на публичный пост Instagram (фото, видео или карусель) — я пришлю медиа обратно.

Команды:
/start — приветствие
/help — эта справка`;

export function registerStart(bot: Bot): void {
  bot.command("start", (ctx) => ctx.reply(WELCOME));
  bot.command("help", (ctx) => ctx.reply(HELP));
}
