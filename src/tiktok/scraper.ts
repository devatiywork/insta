import { logger } from "../logger.js";
import { InvalidUrlError, type ScrapeResult } from "../media/types.js";
import { webStrategy } from "./strategies/web.js";
import { parseTikTokUrl, resolveTikTokUrl } from "./url-parser.js";

export async function scrape(rawUrl: string): Promise<ScrapeResult> {
  const url = await resolveTikTokUrl(rawUrl);
  const info = parseTikTokUrl(url);
  if (!info) throw new InvalidUrlError(rawUrl);

  logger.debug(
    { rawUrl, url, kind: info.kind, id: info.id },
    "tiktok scrape: starting",
  );
  const result = await webStrategy(info);
  logger.debug(
    { id: info.id, items: result.items.length, source: result.source },
    "tiktok scrape: ok",
  );
  return result;
}
