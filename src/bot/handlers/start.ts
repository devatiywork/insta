import type { Bot } from "grammy";
import { isAdmin } from "../access.js";
import { adminKeyboard, userKeyboard } from "../keyboards.js";

const WELCOME = `👋 Привет! Я скачиваю контент из Instagram и TikTok.

Просто отправь мне ссылку на пост / Reels / TikTok-видео или фото-слайдшоу — пришлю медиа обратно.

Поддерживаемые ссылки:
• <code>instagram.com/p/{shortcode}</code>
• <code>instagram.com/reel/{shortcode}</code>
• <code>instagram.com/reels/{shortcode}</code>
• <code>instagram.com/share/{shortcode}</code>
• <code>tiktok.com/@user/video/{id}</code>
• <code>tiktok.com/@user/photo/{id}</code>
• <code>vm.tiktok.com/{short}</code>, <code>vt.tiktok.com/{short}</code>, <code>tiktok.com/t/{short}</code>

⚠️ Бот работает только с публичными постами.

Кнопка <b>⚙️ Настройки</b> внизу — отключение подписи к контенту по платформам.`;

const ADMIN_EXTRA = `

<b>Админ-команды:</b>
• <b>👤 Добавить</b> или /add — добавить пользователя (ID или форвард)
• <b>👥 Список</b> или /users — список пользователей с кнопкой удаления
• /cancel — отменить ввод`;

const HELP = `Отправь ссылку на публичный пост Instagram или TikTok (фото, видео, карусель, слайдшоу) — пришлю медиа обратно.

Команды:
/start — приветствие
/help — эта справка
/settings — подписи к медиа`;

export function registerStart(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const admin = isAdmin(ctx.from?.id);
    const text = admin ? WELCOME + ADMIN_EXTRA : WELCOME;
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: admin ? adminKeyboard() : userKeyboard(),
    });
  });

  bot.command("help", (ctx) =>
    ctx.reply(HELP, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  );
}
