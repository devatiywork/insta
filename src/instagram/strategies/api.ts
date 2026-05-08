import { logger } from "../../logger.js";
import { fetchText } from "../../http.js";
import {
  type MediaItem,
  type ScrapeResult,
  AuthRequiredError,
  NotFoundError,
  PrivateContentError,
  MediaError,
} from "../../media/types.js";
import { getSession } from "../session.js";
import { shortcodeToMediaId } from "../shortcode.js";

const APP_ID = "936619743392459";

interface ApiCandidate {
  url: string;
  width: number;
  height: number;
}

interface ApiMediaItem {
  media_type: number;
  image_versions2?: { candidates?: ApiCandidate[] };
  video_versions?: ApiCandidate[];
  carousel_media?: ApiMediaItem[];
  caption?: { text?: string } | null;
  user?: { username?: string };
  video_duration?: number;
  original_width?: number;
  original_height?: number;
}

interface ApiResponse {
  items?: ApiMediaItem[];
}

function pickBest(candidates: ApiCandidate[] | undefined): ApiCandidate | null {
  if (!candidates || candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    c.width * c.height > best.width * best.height ? c : best,
  );
}

function toItem(node: ApiMediaItem): MediaItem | null {
  if (node.media_type === 2) {
    const video = pickBest(node.video_versions);
    if (!video) return null;
    return {
      kind: "video",
      url: video.url,
      width: video.width,
      height: video.height,
      durationSec: node.video_duration,
    };
  }
  if (node.media_type === 1) {
    const photo = pickBest(node.image_versions2?.candidates);
    if (!photo) return null;
    return {
      kind: "photo",
      url: photo.url,
      width: photo.width,
      height: photo.height,
    };
  }
  return null;
}

export async function apiStrategy(shortcode: string): Promise<ScrapeResult> {
  const mediaId = shortcodeToMediaId(shortcode);
  const url = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;
  const session = await getSession();
  logger.debug(
    { shortcode, mediaId, url, hasCsrf: !!session.csrfToken },
    "api strategy: request",
  );

  const { status, body } = await fetchText(url, {
    headers: {
      "x-ig-app-id": APP_ID,
      "x-asbd-id": "129477",
      "x-ig-www-claim": "0",
      "x-csrftoken": session.csrfToken ?? "",
      "x-requested-with": "XMLHttpRequest",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      Cookie: session.cookies,
      Referer: `https://www.instagram.com/p/${shortcode}/`,
    },
  });

  if (status !== 200) {
    logger.warn(
      { shortcode, status, bodySnippet: body.slice(0, 500) },
      "api strategy: non-200 response",
    );
  }
  if (status === 404) throw new NotFoundError(shortcode);
  if (status === 401 || status === 403) throw new PrivateContentError(shortcode);
  if (status !== 200) {
    throw new MediaError(`API responded with ${status}`);
  }

  const trimmed = body.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const looksLikeLogin = /login|loginandsignuppage|polariserrorroot/i.test(
      body.slice(0, 5000),
    );
    logger.warn(
      {
        shortcode,
        bodyLength: body.length,
        bodySnippet: body.slice(0, 500),
        looksLikeLogin,
        authenticated: session.authenticated,
      },
      "api strategy: got HTML instead of JSON (likely login wall)",
    );
    if (looksLikeLogin && !session.authenticated) {
      throw new AuthRequiredError("instagram");
    }
    throw new MediaError("API returned HTML (login wall)");
  }

  let data: ApiResponse;
  try {
    data = JSON.parse(body) as ApiResponse;
  } catch (err) {
    logger.warn(
      { shortcode, bodySnippet: body.slice(0, 500) },
      "api strategy: invalid JSON",
    );
    throw new MediaError("Failed to parse API response", err);
  }

  const root = data.items?.[0];
  if (!root) {
    logger.warn(
      { shortcode, keys: Object.keys(data) },
      "api strategy: no items in response",
    );
    throw new NotFoundError(shortcode);
  }
  logger.debug(
    {
      shortcode,
      mediaType: root.media_type,
      carouselSize: root.carousel_media?.length,
    },
    "api strategy: parsed root",
  );

  const items: MediaItem[] = [];
  if (root.media_type === 8 && root.carousel_media) {
    for (const child of root.carousel_media) {
      const item = toItem(child);
      if (item) items.push(item);
    }
  } else {
    const item = toItem(root);
    if (item) items.push(item);
  }

  if (items.length === 0) {
    throw new MediaError("No media found in API response");
  }

  return {
    platform: "instagram",
    shortcode,
    caption: root.caption?.text,
    author: root.user?.username,
    items,
    source: "ig-api",
  };
}
