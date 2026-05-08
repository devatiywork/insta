export type MediaKind = "photo" | "video";

export type MediaSource = "ig-api" | "ig-embed" | "tiktok-web" | "youtube-ytdlp";

export type Platform = "instagram" | "tiktok" | "youtube";

export interface MediaItem {
  kind: MediaKind;
  url?: string;
  data?: Uint8Array;
  filename?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  fetchHeaders?: Record<string, string>;
}

export interface AudioInfo {
  url?: string;
  data?: Uint8Array;
  filename?: string;
  title?: string;
  artist?: string;
  durationSec?: number;
  fetchHeaders?: Record<string, string>;
}

export interface ScrapeResult {
  platform: Platform;
  shortcode: string;
  caption?: string;
  author?: string;
  items: MediaItem[];
  source: MediaSource;
  audio?: AudioInfo;
}

export class MediaError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MediaError";
  }
}

export class InvalidUrlError extends MediaError {
  constructor(url: string) {
    super(`Not a supported URL: ${url}`);
    this.name = "InvalidUrlError";
  }
}

export class NotFoundError extends MediaError {
  constructor(id: string) {
    super(`Post not found or unavailable: ${id}`);
    this.name = "NotFoundError";
  }
}

export class PrivateContentError extends MediaError {
  constructor(id: string) {
    super(`Post is private or login-required: ${id}`);
    this.name = "PrivateContentError";
  }
}

const COOKIE_ENV: Record<Platform, string> = {
  instagram: "IG_COOKIES",
  tiktok: "TIKTOK_COOKIES",
  youtube: "YOUTUBE_COOKIES",
};

export class AuthRequiredError extends MediaError {
  constructor(public readonly platform: Platform) {
    super(
      `${platform} blocks anonymous access. Set ${COOKIE_ENV[platform]} in .env (see README).`,
    );
    this.name = "AuthRequiredError";
  }
}

export class TooLargeError extends MediaError {
  constructor(public readonly sizeMb: number) {
    super(`Media is too large for Telegram (${sizeMb.toFixed(1)} MB > 50 MB)`);
    this.name = "TooLargeError";
  }
}
