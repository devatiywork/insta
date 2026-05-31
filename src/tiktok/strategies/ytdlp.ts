import { logger } from "../../logger.js";
import {
  NotFoundError,
  PrivateContentError,
  type ScrapeResult,
} from "../../media/types.js";
import { infoNumber, infoString, ytDlpDownload } from "../../media/ytdlp.js";
import type { TikTokUrlInfo } from "../url-parser.js";

// TikTok-видео вертикальные и обычно небольшие — берём лучший вариант под лимит.
const FORMAT = "best[filesize<=49M]/best[filesize_approx<=49M]/best";

function classifyError(stderr: string, id: string): void {
  const text = stderr.slice(0, 5000);
  if (/private|author of this post|not available in your region/i.test(text)) {
    throw new PrivateContentError(id);
  }
  if (
    /Video not available|Unable to find|content isn'?t available|does not exist|removed|HTTP Error 404|No video formats found/i.test(
      text,
    )
  ) {
    throw new NotFoundError(id);
  }
  // Неизвестный stderr — пусть хелпер кинет общий MediaError.
}

/**
 * Fallback-стратегия: тянет видео TikTok через yt-dlp, когда web-стратегия
 * упёрлась в антибот-WAF или не нашла данные. yt-dlp сам разбирается с
 * подписями/API, поэтому проходит там, где прямой парсинг HTML блокируется.
 */
export async function ytDlpStrategy(
  info: TikTokUrlInfo,
): Promise<ScrapeResult> {
  const { data, filename, info: meta } = await ytDlpDownload(
    info.canonicalUrl,
    {
      format: FORMAT,
      extraArgs: ["--merge-output-format", "mp4"],
      filePattern: /\.(mp4|mkv|webm|mov)$/i,
      tmpPrefix: "tt-",
      label: "tiktok-ytdlp",
      onError: (stderr) => classifyError(stderr, info.id),
    },
  );

  const id = infoString(meta, "id") ?? info.id;
  logger.debug(
    {
      id,
      sizeMb: (data.length / (1024 * 1024)).toFixed(1),
      file: filename,
      duration: infoNumber(meta, "duration"),
    },
    "tiktok ytdlp: scrape ok",
  );

  return {
    platform: "tiktok",
    shortcode: id,
    caption: infoString(meta, "title", "description"),
    author: infoString(meta, "uploader", "creator", "channel"),
    items: [
      {
        kind: "video",
        data,
        filename,
        width: infoNumber(meta, "width"),
        height: infoNumber(meta, "height"),
        durationSec: infoNumber(meta, "duration"),
      },
    ],
    source: "tiktok-ytdlp",
  };
}
