import { logger } from "../logger.js";
import {
  InvalidUrlError,
  MediaError,
  NotFoundError,
  PrivateContentError,
  TooLargeError,
  type ScrapeResult,
} from "../media/types.js";
import { webStrategy } from "./strategies/web.js";
import { ytDlpStrategy } from "./strategies/ytdlp.js";
import { parseTikTokUrl, resolveTikTokUrl } from "./url-parser.js";

/**
 * Окончательные ошибки: yt-dlp их не «вылечит» (пост приватный/удалён,
 * слишком большой, не та ссылка), поэтому fallback бессмыслен.
 */
function isDefinitive(err: unknown): boolean {
  return (
    err instanceof NotFoundError ||
    err instanceof PrivateContentError ||
    err instanceof TooLargeError ||
    err instanceof InvalidUrlError
  );
}

export async function scrape(rawUrl: string): Promise<ScrapeResult> {
  const url = await resolveTikTokUrl(rawUrl);
  const info = parseTikTokUrl(url);
  if (!info) throw new InvalidUrlError(rawUrl);

  logger.debug(
    { rawUrl, url, kind: info.kind, id: info.id },
    "tiktok scrape: starting",
  );

  try {
    const result = await webStrategy(info);
    logger.debug(
      { id: info.id, items: result.items.length, source: result.source },
      "tiktok scrape: ok",
    );
    return result;
  } catch (webErr) {
    if (isDefinitive(webErr)) throw webErr;

    logger.warn(
      {
        id: info.id,
        errName: (webErr as Error).name,
        err: (webErr as Error).message,
      },
      "tiktok web strategy failed — falling back to yt-dlp",
    );

    try {
      const result = await ytDlpStrategy(info);
      logger.info(
        { id: info.id, source: result.source },
        "tiktok scrape: ok via yt-dlp fallback",
      );
      return result;
    } catch (ytErr) {
      if (isDefinitive(ytErr)) throw ytErr;
      logger.error(
        {
          id: info.id,
          webErr: (webErr as Error).message,
          ytdlpErr: (ytErr as Error).message,
        },
        "tiktok scrape: both web and yt-dlp failed",
      );
      // Обе стратегии упали по неопределённой причине — отдаём сводную ошибку.
      // Для админа её текст уходит в Telegram целиком (см. message-handler).
      throw new MediaError(
        `web: ${(webErr as Error).message} | yt-dlp: ${(ytErr as Error).message}`,
        ytErr,
      );
    }
  }
}
