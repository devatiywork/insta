import { logger } from "../../logger.js";
import { fetchText } from "../../http.js";
import {
  type MediaItem,
  type ScrapeResult,
  AuthRequiredError,
  NotFoundError,
  MediaError,
} from "../../media/types.js";
import { getSession } from "../session.js";

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
  const session = await getSession();
  logger.debug({ shortcode, url }, "embed strategy: request");
  const { status, body } = await fetchText(url, {
    headers: {
      Referer: "https://www.instagram.com/",
      Cookie: session.cookies,
    },
  });

  if (status !== 200) {
    logger.warn(
      { shortcode, status, bodySnippet: body.slice(0, 500) },
      "embed strategy: non-200 response",
    );
  }
  if (status === 404) throw new NotFoundError(shortcode);
  if (status !== 200) {
    throw new MediaError(`Embed responded with ${status}`);
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
    const ogVideo =
      body.match(
        /<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/,
      )?.[1] ??
      body.match(/<meta\s+property="og:video"\s+content="([^"]+)"/)?.[1];
    if (ogVideo) {
      items.push({ kind: "video", url: unescapeHtmlEntities(ogVideo) });
    }
  }

  if (items.length === 0) {
    const ogImage = body.match(
      /<meta\s+property="og:image"\s+content="([^"]+)"/,
    )?.[1];
    if (ogImage) {
      items.push({ kind: "photo", url: unescapeHtmlEntities(ogImage) });
    }
  }

  if (items.length === 0) {
    const videoVersionsMatch = body.match(
      /"video_versions":\s*\[\s*\{[^}]*?"url":\s*"([^"]+)"/,
    );
    if (videoVersionsMatch && videoVersionsMatch[1]) {
      items.push({
        kind: "video",
        url: decodeJsonString(videoVersionsMatch[1]),
      });
    }
  }

  if (items.length === 0) {
    const anchors = [
      "video_url",
      "display_url",
      "video_versions",
      "image_versions2",
      "og:video",
      "og:image",
      "LoginAndSignupPage",
      "loginPage",
      "PolarisErrorRoot",
      "csrf_token",
      "shortcode_media",
      "xdt_api__v1__media",
    ];
    const found = anchors.filter((a) => body.includes(a));
    const titleMatch = body.match(/<title>([^<]*)<\/title>/);
    const looksLikeLogin =
      found.includes("loginPage") ||
      found.includes("LoginAndSignupPage") ||
      found.includes("PolarisErrorRoot");
    logger.warn(
      {
        shortcode,
        title: titleMatch?.[1],
        foundAnchors: found,
        looksLikeLogin,
        authenticated: session.authenticated,
        bodyLength: body.length,
      },
      "embed strategy: no media matched",
    );
    if (looksLikeLogin && !session.authenticated) {
      throw new AuthRequiredError("instagram");
    }
    throw new MediaError("No media found in embed page");
  }
  logger.debug(
    { shortcode, items: items.length, kinds: items.map((i) => i.kind) },
    "embed strategy: parsed",
  );

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
    platform: "instagram",
    shortcode,
    caption,
    author,
    items,
    source: "ig-embed",
  };
}
