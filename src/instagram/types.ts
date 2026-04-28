export type MediaKind = "photo" | "video";

export interface MediaItem {
  kind: MediaKind;
  url: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface ScrapeResult {
  shortcode: string;
  caption?: string;
  author?: string;
  items: MediaItem[];
  source: "api" | "embed";
}

export class InstagramError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "InstagramError";
  }
}

export class InvalidUrlError extends InstagramError {
  constructor(url: string) {
    super(`Not a valid Instagram URL: ${url}`);
    this.name = "InvalidUrlError";
  }
}

export class NotFoundError extends InstagramError {
  constructor(shortcode: string) {
    super(`Post not found or unavailable: ${shortcode}`);
    this.name = "NotFoundError";
  }
}

export class PrivateContentError extends InstagramError {
  constructor(shortcode: string) {
    super(`Post is private or login-required: ${shortcode}`);
    this.name = "PrivateContentError";
  }
}
