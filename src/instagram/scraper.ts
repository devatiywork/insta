import { logger } from "../logger.js";
import { apiStrategy } from "./strategies/api.js";
import { embedStrategy } from "./strategies/embed.js";
import {
  extractShortcode,
  resolveShareUrl,
} from "./url-parser.js";
import {
  InvalidUrlError,
  PrivateContentError,
  type ScrapeResult,
} from "./types.js";

export async function scrape(rawUrl: string): Promise<ScrapeResult> {
  const url = await resolveShareUrl(rawUrl);
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new InvalidUrlError(rawUrl);

  try {
    return await apiStrategy(shortcode);
  } catch (err) {
    if (err instanceof PrivateContentError) throw err;
    logger.warn(
      { shortcode, err: (err as Error).message },
      "api strategy failed, falling back to embed",
    );
    return await embedStrategy(shortcode);
  }
}
