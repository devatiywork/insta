import { logger } from "../logger.js";
import { pickUserAgent } from "../http.js";

const SHORT_HOST_RE =
  /^https?:\/\/(?:vm|vt|m)\.tiktok\.com\/[A-Za-z0-9]+/i;
const SHORT_PATH_RE =
  /^https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]+/i;

const URL_IN_TEXT_RE =
  /https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/\S+/i;

const CANONICAL_RE =
  /tiktok\.com\/(?:@[^/]+)\/(video|photo)\/(\d+)/i;

export interface TikTokUrlInfo {
  kind: "video" | "photo";
  id: string;
  canonicalUrl: string;
}

export function findTikTokUrl(text: string): string | null {
  const match = text.match(URL_IN_TEXT_RE);
  return match ? match[0] : null;
}

export function isTikTokShortUrl(url: string): boolean {
  return SHORT_HOST_RE.test(url) || SHORT_PATH_RE.test(url);
}

export async function resolveTikTokUrl(rawUrl: string): Promise<string> {
  if (!isTikTokShortUrl(rawUrl)) return rawUrl;
  logger.debug({ rawUrl }, "tiktok: resolving short url");
  const res = await fetch(rawUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": pickUserAgent(),
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const finalUrl = res.url || rawUrl;
  logger.debug({ rawUrl, finalUrl }, "tiktok: short url resolved");
  return finalUrl;
}

export function parseTikTokUrl(url: string): TikTokUrlInfo | null {
  const match = url.match(CANONICAL_RE);
  if (!match || !match[1] || !match[2]) return null;
  const kind = match[1].toLowerCase() === "photo" ? "photo" : "video";
  const id = match[2];
  const canonicalUrl = url.split("?")[0] ?? url;
  return { kind, id, canonicalUrl };
}
