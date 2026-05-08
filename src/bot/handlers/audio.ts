import { type Bot, type Context, InputFile } from "grammy";
import { logger } from "../../logger.js";
import { extractAudio } from "../../media/audio.js";
import { detectUrl } from "../../media/dispatch.js";
import {
  AuthRequiredError,
  InvalidUrlError,
  MediaError,
  NotFoundError,
  PrivateContentError,
  TooLargeError,
} from "../../media/types.js";
import { recordError } from "../../stats.js";
import { getMedia } from "../audio-cache.js";

function audioErrorMessage(err: unknown): string {
  if (err instanceof InvalidUrlError)
    return "❌ Это не похоже на ссылку Instagram, TikTok или YouTube.";
  if (err instanceof NotFoundError)
    return "❌ Пост не найден или удалён.";
  if (err instanceof PrivateContentError)
    return "🔒 Пост приватный — не достаю.";
  if (err instanceof AuthRequiredError)
    return `🔐 ${err.platform} требует авторизации. Попроси админа добавить cookies.`;
  if (err instanceof TooLargeError)
    return `⚠️ Аудио слишком большое (${err.sizeMb.toFixed(1)} MB > 50 MB лимита).`;
  if (err instanceof MediaError)
    return "⚠️ Не удалось извлечь аудио. Попробуй ещё раз.";
  return "⚠️ Что-то пошло не так. Попробуй ещё раз.";
}

async function sendAudio(
  ctx: Context,
  url: string,
  platform: Parameters<typeof extractAudio>[1],
): Promise<void> {
  await ctx.replyWithChatAction("upload_voice");
  const audio = await extractAudio(url, platform);
  await ctx.replyWithAudio(new InputFile(audio.data, audio.filename), {
    title: audio.title?.slice(0, 64),
    performer: audio.performer?.slice(0, 64),
    duration: audio.durationSec ? Math.round(audio.durationSec) : undefined,
  });
}

export function registerAudio(bot: Bot): void {
  bot.callbackQuery(/^aud:[a-f0-9]+$/, async (ctx) => {
    const data = ctx.callbackQuery.data!;
    const id = data.slice(4);
    const entry = getMedia(id);
    const log = logger.child({
      userId: ctx.from?.id,
      callbackData: data,
    });

    if (!entry) {
      await ctx.answerCallbackQuery({
        text: "Кэш истёк — пришли ссылку заново.",
        show_alert: true,
      });
      return;
    }

    try {
      await ctx.answerCallbackQuery({ text: "Извлекаю аудио…" });
      await sendAudio(ctx, entry.url, entry.platform);
      log.info({ platform: entry.platform }, "audio extracted via button");
    } catch (err) {
      log.error({ err }, "audio extraction failed (button)");
      recordError({
        userId: ctx.from?.id,
        username: ctx.from?.username,
        platform: entry.platform,
        errorName: (err as Error).name,
        errorMsg: (err as Error).message,
      });
      await ctx.reply(audioErrorMessage(err));
    }
  });

  bot.command("audio", async (ctx) => {
    const args = ctx.message?.text?.replace(/^\/audio(@\S+)?\s*/i, "") ?? "";
    const replyText = ctx.message?.reply_to_message?.text ?? "";
    const detected = detectUrl(args) ?? detectUrl(replyText);

    if (!detected) {
      await ctx.reply(
        "Использование: <code>/audio &lt;ссылка&gt;</code> или ответ командой /audio на сообщение со ссылкой.",
        { parse_mode: "HTML" },
      );
      return;
    }

    const log = logger.child({
      userId: ctx.from?.id,
      platform: detected.platform,
      url: detected.url,
    });

    try {
      await sendAudio(ctx, detected.url, detected.platform);
      log.info("audio extracted via /audio command");
    } catch (err) {
      log.error({ err }, "audio extraction failed (command)");
      recordError({
        userId: ctx.from?.id,
        username: ctx.from?.username,
        platform: detected.platform,
        errorName: (err as Error).name,
        errorMsg: (err as Error).message,
      });
      await ctx.reply(audioErrorMessage(err));
    }
  });
}
