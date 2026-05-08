export type MediaKind = "photo" | "video";

export type MediaSource = "ig-api" | "ig-embed" | "tiktok-web";

export type Platform = "instagram" | "tiktok";

export interface MediaItem {
  kind: MediaKind;
  url: string;
  width?: number;
  height?: number;
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

export class AuthRequiredError extends MediaError {
  constructor(public readonly platform: Platform) {
    super(
      `${platform} blocks anonymous access. Set ${
        platform === "instagram" ? "IG_COOKIES" : "TIKTOK_COOKIES"
      } in .env (see README).`,
    );
    this.name = "AuthRequiredError";
  }
}
