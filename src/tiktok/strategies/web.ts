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
import type { TikTokUrlInfo } from "../url-parser.js";

const DATA_SCRIPT_RE =
  /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i;

interface BitrateEntry {
  PlayAddr?: { UrlList?: string[] };
  Bitrate?: number;
  GearName?: string;
}

interface ItemStruct {
  id?: string;
  desc?: string;
  author?: { uniqueId?: string; nickname?: string };
  video?: {
    playAddr?: string;
    downloadAddr?: string;
    width?: number;
    height?: number;
    duration?: number;
    cover?: string;
    bitrateInfo?: BitrateEntry[];
  };
  imagePost?: {
    images?: Array<{
      imageURL?: { urlList?: string[] };
      imageWidth?: number;
      imageHeight?: number;
    }>;
    title?: string;
  };
  music?: {
    id?: string | number;
    title?: string;
    authorName?: string;
    playUrl?: string;
    duration?: number;
    original?: boolean;
  };
}

interface UniversalData {
  __DEFAULT_SCOPE__?: {
    "webapp.video-detail"?: {
      statusCode?: number;
      statusMsg?: string;
      itemInfo?: { itemStruct?: ItemStruct };
    };
  };
}

function pickVideoUrl(video: NonNullable<ItemStruct["video"]>): string | null {
  const bitrates = video.bitrateInfo ?? [];
  let best: { url: string; bitrate: number } | null = null;
  for (const entry of bitrates) {
    const url = entry.PlayAddr?.UrlList?.[0];
    if (!url) continue;
    const bitrate = entry.Bitrate ?? 0;
    if (!best || bitrate > best.bitrate) {
      best = { url, bitrate };
    }
  }
  if (best) return best.url;
  return video.playAddr ?? video.downloadAddr ?? null;
}

function extractData(html: string): UniversalData | null {
  const match = html.match(DATA_SCRIPT_RE);
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1]) as UniversalData;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, snippet: match[1].slice(0, 200) },
      "tiktok: failed to parse __UNIVERSAL_DATA_FOR_REHYDRATION__",
    );
    return null;
  }
}

export async function webStrategy(
  info: TikTokUrlInfo,
): Promise<ScrapeResult> {
  const session = await getSession();
  const url = info.canonicalUrl;
  logger.debug(
    {
      id: info.id,
      kind: info.kind,
      url,
      hasAuthCookies: session.authenticated,
    },
    "tiktok web: request",
  );

  const { status, body } = await fetchText(url, {
    userAgent: session.userAgent,
    headers: {
      Referer: "https://www.tiktok.com/",
      Cookie: session.cookies,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
  });

  if (status === 404) throw new NotFoundError(info.id);
  if (status !== 200) {
    logger.warn(
      { id: info.id, status, bodySnippet: body.slice(0, 500) },
      "tiktok web: non-200 response",
    );
    throw new MediaError(`TikTok responded with ${status}`);
  }

  const data = extractData(body);
  if (!data) {
    const looksLikeLogin =
      /tiktok-login|PolarisLoginPage|Log in to TikTok/i.test(
        body.slice(0, 5000),
      );
    logger.warn(
      {
        id: info.id,
        bodyLength: body.length,
        bodySnippet: body.slice(0, 500),
        looksLikeLogin,
        authenticated: session.authenticated,
      },
      "tiktok web: data script not found",
    );
    if (looksLikeLogin && !session.authenticated) {
      throw new AuthRequiredError("tiktok");
    }
    throw new MediaError("TikTok page missing rehydration data");
  }

  const detail = data.__DEFAULT_SCOPE__?.["webapp.video-detail"];
  const statusCode = detail?.statusCode;
  if (statusCode && statusCode !== 0) {
    logger.warn(
      { id: info.id, statusCode, statusMsg: detail?.statusMsg },
      "tiktok web: detail returned error status",
    );
    if (statusCode === 10204 || statusCode === 10231) {
      throw new NotFoundError(info.id);
    }
    if (statusCode === 10222 || statusCode === 10221) {
      throw new PrivateContentError(info.id);
    }
    throw new MediaError(
      `TikTok detail status ${statusCode}: ${detail?.statusMsg ?? "unknown"}`,
    );
  }

  const item = detail?.itemInfo?.itemStruct;
  if (!item) {
    logger.warn(
      {
        id: info.id,
        scopeKeys: data.__DEFAULT_SCOPE__
          ? Object.keys(data.__DEFAULT_SCOPE__)
          : [],
        detailKeys: detail ? Object.keys(detail) : [],
        itemInfoKeys: detail?.itemInfo
          ? Object.keys(detail.itemInfo)
          : [],
        statusCode: detail?.statusCode,
        statusMsg: detail?.statusMsg,
      },
      "tiktok web: itemStruct missing — structure changed?",
    );
    throw new NotFoundError(info.id);
  }

  const fetchHeaders = {
    Referer: "https://www.tiktok.com/",
    "User-Agent": session.userAgent,
    Cookie: session.cookies,
    "Accept-Language": "en-US,en;q=0.9",
  };

  const items: MediaItem[] = [];

  if (item.imagePost?.images && item.imagePost.images.length > 0) {
    for (const img of item.imagePost.images) {
      const photoUrl = img.imageURL?.urlList?.[0];
      if (!photoUrl) continue;
      items.push({
        kind: "photo",
        url: photoUrl,
        width: img.imageWidth,
        height: img.imageHeight,
        fetchHeaders,
      });
    }
  } else if (item.video) {
    const videoUrl = pickVideoUrl(item.video);
    if (videoUrl) {
      items.push({
        kind: "video",
        url: videoUrl,
        width: item.video.width,
        height: item.video.height,
        durationSec: item.video.duration,
        fetchHeaders,
      });
    }
  }

  if (items.length === 0) {
    logger.warn(
      {
        id: info.id,
        hasVideo: !!item.video,
        hasImagePost: !!item.imagePost,
        imageCount: item.imagePost?.images?.length,
      },
      "tiktok web: no media extracted",
    );
    throw new MediaError("No media found in TikTok response");
  }

  logger.debug(
    {
      id: info.id,
      items: items.length,
      kinds: items.map((i) => i.kind),
    },
    "tiktok web: parsed",
  );

  const audio = item.music?.playUrl
    ? {
        url: item.music.playUrl,
        title: item.music.title,
        artist: item.music.authorName,
        durationSec: item.music.duration,
        filename: `${item.music.id ?? item.id ?? info.id}.mp3`,
        fetchHeaders,
      }
    : undefined;

  return {
    platform: "tiktok",
    shortcode: item.id ?? info.id,
    caption: item.desc || item.imagePost?.title || undefined,
    author: item.author?.uniqueId,
    items,
    source: "tiktok-web",
    audio,
  };
}
