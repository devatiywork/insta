import { logger } from "../logger.js";
import {
  InvalidUrlError,
  PrivateContentError,
  type ScrapeResult,
} from "../media/types.js";
import { apiStrategy } from "./strategies/api.js";
import { embedStrategy } from "./strategies/embed.js";
import { extractShortcode, resolveShareUrl } from "./url-parser.js";

export async function scrape(rawUrl: string): Promise<ScrapeResult> {
  const url = await resolveShareUrl(rawUrl);
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new InvalidUrlError(rawUrl);

  logger.debug({ rawUrl, url, shortcode }, "scrape: starting");
  try {
    const result = await apiStrategy(shortcode);
    logger.debug(
      { shortcode, items: result.items.length, source: result.source },
      "scrape: api ok",
    );
    return result;
  } catch (err) {
    if (err instanceof PrivateContentError) throw err;
    logger.warn(
      { shortcode, err },
      "api strategy failed, falling back to embed",
    );
    const result = await embedStrategy(shortcode);
    logger.debug(
      { shortcode, items: result.items.length, source: result.source },
      "scrape: embed ok",
    );
    return result;
  }
}
