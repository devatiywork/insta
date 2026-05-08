import { randomBytes } from "node:crypto";
import type { Platform } from "../media/types.js";

interface Entry {
  url: string;
  platform: Platform;
}

const MAX_ENTRIES = 500;
const cache = new Map<string, Entry>();

export function rememberMedia(url: string, platform: Platform): string {
  const id = randomBytes(6).toString("hex");
  cache.set(id, { url, platform });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return id;
}

export function getMedia(id: string): Entry | undefined {
  return cache.get(id);
}
