import { logger } from "../logger.js";

interface SessionCache {
  cookies: string;
  csrfToken?: string;
  expiresAt: number;
}

let cache: SessionCache | null = null;
const TTL_MS = 30 * 60 * 1000;

const HOME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export async function getSession(force = false): Promise<SessionCache> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache;

  logger.debug("bootstrapping instagram session");
  const startedAt = Date.now();
  const res = await fetch("https://www.instagram.com/", {
    headers: {
      "User-Agent": HOME_USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const setCookies: string[] = res.headers.getSetCookie?.() ?? [];
  const cookieMap = new Map<string, string>();
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx > 0) {
      cookieMap.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  const cookies = Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const csrfToken = cookieMap.get("csrftoken");

  cache = { cookies, csrfToken, expiresAt: Date.now() + TTL_MS };
  logger.debug(
    {
      status: res.status,
      hasCsrf: !!csrfToken,
      cookieKeys: Array.from(cookieMap.keys()),
      elapsedMs: Date.now() - startedAt,
    },
    "instagram session ready",
  );
  return cache;
}

export function clearSession(): void {
  cache = null;
}
