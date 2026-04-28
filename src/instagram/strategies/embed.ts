import { fetchText } from "../http.js";
import {
  type MediaItem,
  type ScrapeResult,
  NotFoundError,
  InstagramError,
} from "../types.js";

function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeJsonString(s: string): string {
  return unescapeUnicode(s.replace(/\\\//g, "/").replace(/\\"/g, '"'));
}

export async function embedStrategy(shortcode: string): Promise<ScrapeResult> {
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const { status, body } = await fetchText(url, {
    headers: { Referer: "https://www.instagram.com/" },
  });

  if (status === 404) throw new NotFoundError(shortcode);
  if (status !== 200) {
    throw new InstagramError(`Embed responded with ${status}`);
  }

  if (
    body.includes("This post is no longer available") ||
    body.includes("Sorry, this post isn't available")
  ) {
    throw new NotFoundError(shortcode);
  }

  const items: MediaItem[] = [];

  const videoMatch = body.match(/"video_url":"([^"]+)"/);
  if (videoMatch && videoMatch[1]) {
    items.push({ kind: "video", url: decodeJsonString(videoMatch[1]) });
  }

  if (items.length === 0) {
    const displayMatch = body.match(/"display_url":"([^"]+)"/);
    if (displayMatch && displayMatch[1]) {
      items.push({ kind: "photo", url: decodeJsonString(displayMatch[1]) });
    }
  }

  if (items.length === 0) {
    const imgMatch = body.match(
      /<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/,
    );
    if (imgMatch && imgMatch[1]) {
      items.push({ kind: "photo", url: unescapeHtmlEntities(imgMatch[1]) });
    }
  }

  if (items.length === 0) {
    throw new InstagramError("No media found in embed page");
  }

  let caption: string | undefined;
  const captionMatch = body.match(/"caption_text":"((?:[^"\\]|\\.)*)"/);
  if (captionMatch && captionMatch[1]) {
    caption = decodeJsonString(captionMatch[1]);
  } else {
    const captionDiv = body.match(/<div class="Caption"[\s\S]*?<\/div>/);
    if (captionDiv) {
      caption = unescapeHtmlEntities(
        captionDiv[0]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
  }

  let author: string | undefined;
  const authorMatch = body.match(
    /<a[^>]+class="[^"]*UsernameText[^"]*"[^>]*>([^<]+)<\/a>/,
  );
  if (authorMatch && authorMatch[1]) {
    author = authorMatch[1].trim();
  }

  return {
    shortcode,
    caption,
    author,
    items,
    source: "embed",
  };
}
