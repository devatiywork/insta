import type { Bot } from "grammy";
import { detectUrl, scrapeByPlatform } from "../../media/dispatch.js";
import { sendMedia } from "../../media/send-media.js";
import {
  AuthRequiredError,
  InvalidUrlError,
  MediaError,
  NotFoundError,
  PrivateContentError,
} from "../../media/types.js";
import { logger } from "../../logger.js";

function userMessageForError(err: unknown): string {
  if (err instanceof InvalidUrlError)
    return "❌ Это не похоже на ссылку Instagram или TikTok.";
  if (err instanceof NotFoundError) return "❌ Пост не найден или удалён.";
  if (err instanceof PrivateContentError)
    return "🔒 Пост приватный — я работаю только с публичными.";
  if (err instanceof AuthRequiredError) {
    const envName =
      err.platform === "instagram" ? "IG_COOKIES" : "TIKTOK_COOKIES";
    return `🔐 ${err.platform === "instagram" ? "Instagram" : "TikTok"} требует авторизованную сессию. Админу: пропиши ${envName} в .env (см. README).`;
  }
  if (err instanceof MediaError)
    return "⚠️ Не удалось получить медиа. Попробуй ещё раз позже.";
  return "⚠️ Что-то пошло не так. Попробуй ещё раз.";
}

export function registerMessage(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const detected = detectUrl(text);
    if (!detected) {
      await ctx.reply(
        "Пришли ссылку на пост Instagram или TikTok. /help для подробностей.",
      );
      return;
    }

    const log = logger.child({
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      platform: detected.platform,
      url: detected.url,
    });

    try {
      await ctx.replyWithChatAction("upload_video");
      const result = await scrapeByPlatform(detected);
      log.info(
        { items: result.items.length, source: result.source },
        "scrape success",
      );
      await sendMedia(ctx, result);
    } catch (err) {
      log.error({ err }, "scrape or send failed");
      await ctx.reply(userMessageForError(err));
    }
  });
}
