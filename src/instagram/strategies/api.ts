import { fetchText } from "../http.js";
import { shortcodeToMediaId } from "../shortcode.js";
import {
  type MediaItem,
  type ScrapeResult,
  NotFoundError,
  PrivateContentError,
  InstagramError,
} from "../types.js";

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

  const { status, body } = await fetchText(url, {
    headers: {
      "x-ig-app-id": APP_ID,
      "x-asbd-id": "129477",
      "x-ig-www-claim": "0",
      "sec-fetch-site": "same-origin",
      Referer: `https://www.instagram.com/p/${shortcode}/`,
    },
  });

  if (status === 404) throw new NotFoundError(shortcode);
  if (status === 401 || status === 403) throw new PrivateContentError(shortcode);
  if (status !== 200) {
    throw new InstagramError(`API responded with ${status}`);
  }

  let data: ApiResponse;
  try {
    data = JSON.parse(body) as ApiResponse;
  } catch (err) {
    throw new InstagramError("Failed to parse API response", err);
  }

  const root = data.items?.[0];
  if (!root) throw new NotFoundError(shortcode);

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
    throw new InstagramError("No media found in API response");
  }

  return {
    shortcode,
    caption: root.caption?.text,
    author: root.user?.username,
    items,
    source: "api",
  };
}
