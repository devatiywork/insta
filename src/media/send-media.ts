import {
  type Context,
  InlineKeyboard,
  InputFile,
  InputMediaBuilder,
} from "grammy";
import type { InputMediaPhoto, InputMediaVideo } from "grammy/types";
import type { MediaItem, MediaSource, ScrapeResult } from "./types.js";

const TG_CAPTION_LIMIT = 1024;

// Способ получения для админской подписи: «база» — основная стратегия
// платформы, «альтернатива» — fallback (например, yt-dlp для TikTok).
const SOURCE_TIER: Record<MediaSource, string> = {
  "ig-api": "база",
  "ig-embed": "альтернатива",
  "tiktok-web": "база",
  "tiktok-ytdlp": "альтернатива",
  "youtube-ytdlp": "база",
};

export interface SendOptions {
  disableCaption?: boolean;
  inlineKeyboard?: InlineKeyboard;
  /** Дописать в подпись способ получения (показывается только админам). */
  showSource?: boolean;
}

function sourceNote(source: MediaSource): string {
  return `🛠 способ: ${SOURCE_TIER[source]} (${source})`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function buildCaption(
  result: ScrapeResult,
  showBody: boolean,
  note?: string,
): string | undefined {
  const author = result.author ? `@${result.author}` : "";
  const body = showBody
    ? [author, result.caption].filter(Boolean).join("\n\n")
    : "";

  if (!note) return body ? truncate(body, TG_CAPTION_LIMIT) : undefined;
  if (!body) return note;

  // Note (для админа) показываем целиком, тело подписи ужимаем под остаток.
  const room = TG_CAPTION_LIMIT - note.length - 2; // запас под "\n\n"
  const head = room > 0 ? truncate(body, room) : "";
  return head ? `${head}\n\n${note}` : note;
}

async function fileFromItem(item: MediaItem): Promise<InputFile> {
  const ext = item.kind === "video" ? "mp4" : "jpg";
  const filename = item.filename ?? `media.${ext}`;

  if (item.data) {
    return new InputFile(item.data, filename);
  }
  if (!item.url) {
    throw new Error("MediaItem has neither url nor data");
  }
  if (item.fetchHeaders) {
    const res = await fetch(item.url, { headers: item.fetchHeaders });
    if (!res.ok) {
      throw new Error(
        `Failed to download media (${item.kind}): HTTP ${res.status}`,
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return new InputFile(buf, filename);
  }
  return new InputFile(new URL(item.url), filename);
}

export async function sendMedia(
  ctx: Context,
  result: ScrapeResult,
  options: SendOptions = {},
): Promise<void> {
  const note = options.showSource ? sourceNote(result.source) : undefined;
  const caption = buildCaption(result, !options.disableCaption, note);
  const replyMarkup = options.inlineKeyboard;

  if (result.items.length === 1) {
    const item = result.items[0]!;
    const file = await fileFromItem(item);
    if (item.kind === "video") {
      await ctx.replyWithVideo(file, {
        caption,
        supports_streaming: true,
        width: item.width,
        height: item.height,
        duration: item.durationSec ? Math.round(item.durationSec) : undefined,
        reply_markup: replyMarkup,
      });
    } else {
      await ctx.replyWithPhoto(file, { caption, reply_markup: replyMarkup });
    }
    return;
  }

  const files = await Promise.all(result.items.map(fileFromItem));
  const group: Array<InputMediaPhoto | InputMediaVideo> = result.items.map(
    (item, index) => {
      const file = files[index]!;
      const itemCaption = index === 0 ? caption : undefined;
      return item.kind === "video"
        ? InputMediaBuilder.video(file, { caption: itemCaption })
        : InputMediaBuilder.photo(file, { caption: itemCaption });
    },
  );

  for (let i = 0; i < group.length; i += 10) {
    const chunk = group.slice(i, i + 10);
    await ctx.replyWithMediaGroup(chunk);
  }
}
