import { config } from "../config.js";
import { logger } from "../logger.js";
import { pickUserAgent } from "../http.js";

interface SessionCache {
  cookies: string;
  csrfToken?: string;
  userAgent: string;
  expiresAt: number;
  authenticated: boolean;
}

let cache: SessionCache | null = null;
const TTL_MS = 30 * 60 * 1000;

function extractCookieValue(cookies: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookies.match(re);
  return match ? match[1] : undefined;
}

export async function getSession(force = false): Promise<SessionCache> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache;

  if (config.tiktokCookies) {
    const csrfToken = extractCookieValue(config.tiktokCookies, "tt_csrf_token");
    const sessionId = extractCookieValue(config.tiktokCookies, "sessionid");
    cache = {
      cookies: config.tiktokCookies,
      csrfToken,
      userAgent: pickUserAgent(),
      expiresAt: Number.MAX_SAFE_INTEGER,
      authenticated: !!sessionId,
    };
    logger.debug(
      {
        hasCsrf: !!csrfToken,
        hasSessionId: !!sessionId,
        cookieKeys: config.tiktokCookies
          .split(";")
          .map((s) => s.trim().split("=")[0])
          .filter(Boolean),
      },
      "tiktok: using TIKTOK_COOKIES from env",
    );
    return cache;
  }

  logger.debug("tiktok: bootstrapping anonymous session");
  const startedAt = Date.now();
  const userAgent = pickUserAgent();
  const res = await fetch("https://www.tiktok.com/", {
    headers: {
      "User-Agent": userAgent,
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
  const csrfToken = cookieMap.get("tt_csrf_token");

  cache = {
    cookies,
    csrfToken,
    userAgent,
    expiresAt: Date.now() + TTL_MS,
    authenticated: false,
  };
  logger.debug(
    {
      status: res.status,
      hasCsrf: !!csrfToken,
      cookieKeys: Array.from(cookieMap.keys()),
      elapsedMs: Date.now() - startedAt,
    },
    "tiktok: anonymous session ready",
  );
  return cache;
}

export function clearSession(): void {
  cache = null;
}
