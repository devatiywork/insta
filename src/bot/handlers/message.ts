import { type Bot, InlineKeyboard } from "grammy";
import { logger } from "../../logger.js";
import { detectUrl, scrapeByPlatform } from "../../media/dispatch.js";
import { sendMedia } from "../../media/send-media.js";
import {
  AuthRequiredError,
  InvalidUrlError,
  MediaError,
  NotFoundError,
  PrivateContentError,
  TooLargeError,
  type Platform,
  type ScrapeResult,
} from "../../media/types.js";
import { recordDownload, recordError } from "../../stats.js";
import { getPrefs, touchAllowedUser } from "../../storage.js";
import { rememberMedia } from "../audio-cache.js";
import { handleAdminPendingMessage } from "./admin.js";

function userMessageForError(err: unknown): string {
  if (err instanceof InvalidUrlError)
    return "❌ Это не похоже на ссылку Instagram, TikTok или YouTube.";
  if (err instanceof NotFoundError) return "❌ Пост не найден или удалён.";
  if (err instanceof PrivateContentError)
    return "🔒 Пост приватный — я работаю только с публичными.";
  if (err instanceof AuthRequiredError) {
    const envName =
      err.platform === "instagram"
        ? "IG_COOKIES"
        : err.platform === "tiktok"
          ? "TIKTOK_COOKIES"
          : "куки";
    const label =
      err.platform === "instagram"
        ? "Instagram"
        : err.platform === "tiktok"
          ? "TikTok"
          : "YouTube";
    return `🔐 ${label} требует авторизованную сессию. Админу: пропиши ${envName} в .env (см. README).`;
  }
  if (err instanceof TooLargeError)
    return `⚠️ Файл слишком большой (${err.sizeMb.toFixed(1)} MB > 50 MB лимита Telegram).`;
  if (err instanceof MediaError)
    return "⚠️ Не удалось получить медиа. Попробуй ещё раз позже.";
  return "⚠️ Что-то пошло не так. Попробуй ещё раз.";
}

function shouldDisableCaption(
  result: ScrapeResult,
  prefs: ReturnType<typeof getPrefs>,
): boolean {
  if (result.platform === "instagram") return !prefs.igCaption;
  if (result.platform === "tiktok") return !prefs.ttCaption;
  if (result.platform === "youtube") return !prefs.ytCaption;
  return false;
}

function buildAudioKeyboard(
  result: ScrapeResult,
  url: string,
): InlineKeyboard | undefined {
  if (result.items.length !== 1) return undefined;
  const item = result.items[0];
  if (!item || item.kind !== "video") return undefined;
  const id = rememberMedia(url, result.platform);
  return new InlineKeyboard().text("🎵 Аудио", `aud:${id}`);
}

export function registerMessage(bot: Bot): void {
  bot.on("message", async (ctx, next) => {
    if (await handleAdminPendingMessage(ctx)) return;
    await next();
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const detected = detectUrl(text);
    if (!detected) return;

    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    if (userId !== undefined) touchAllowedUser(userId, username);

    const log = logger.child({
      chatId: ctx.chat.id,
      userId,
      platform: detected.platform,
      url: detected.url,
    });

    let platform: Platform | null = detected.platform;

    try {
      await ctx.replyWithChatAction("upload_video");
      const result = await scrapeByPlatform(detected);
      platform = result.platform;
      const prefs = userId !== undefined ? getPrefs(userId) : null;
      const disableCaption = prefs ? shouldDisableCaption(result, prefs) : false;
      const inlineKeyboard = buildAudioKeyboard(result, detected.url);
      log.info(
        {
          items: result.items.length,
          source: result.source,
          disableCaption,
          audioButton: !!inlineKeyboard,
        },
        "scrape success",
      );
      await sendMedia(ctx, result, { disableCaption, inlineKeyboard });
      if (userId !== undefined) {
        recordDownload(userId, username, result.platform);
      }
    } catch (err) {
      log.error({ err }, "scrape or send failed");
      recordError({
        userId,
        username,
        platform,
        errorName: (err as Error).name,
        errorMsg: (err as Error).message,
      });
      await ctx.reply(userMessageForError(err));
    }
  });
}
