import { scrape as instagramScrape } from "../instagram/scraper.js";
import { findInstagramUrl } from "../instagram/url-parser.js";
import { scrape as tiktokScrape } from "../tiktok/scraper.js";
import { findTikTokUrl } from "../tiktok/url-parser.js";
import { scrape as youtubeScrape } from "../youtube/scraper.js";
import { findYouTubeUrl } from "../youtube/url-parser.js";
import type { Platform, ScrapeResult } from "./types.js";

export interface DetectedUrl {
  platform: Platform;
  url: string;
}

export function detectUrl(text: string): DetectedUrl | null {
  const ig = findInstagramUrl(text);
  if (ig) return { platform: "instagram", url: ig };
  const tt = findTikTokUrl(text);
  if (tt) return { platform: "tiktok", url: tt };
  const yt = findYouTubeUrl(text);
  if (yt) return { platform: "youtube", url: yt };
  return null;
}

export async function scrapeByPlatform(
  detected: DetectedUrl,
): Promise<ScrapeResult> {
  switch (detected.platform) {
    case "instagram":
      return instagramScrape(detected.url);
    case "tiktok":
      return tiktokScrape(detected.url);
    case "youtube":
      return youtubeScrape(detected.url);
  }
}
