import { config } from "../config.js";
import { logger } from "../logger.js";

interface SessionCache {
  cookies: string;
  csrfToken?: string;
  expiresAt: number;
  authenticated: boolean;
}

let cache: SessionCache | null = null;
const TTL_MS = 30 * 60 * 1000;

const HOME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function extractCookieValue(cookies: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookies.match(re);
  return match ? match[1] : undefined;
}

export async function getSession(force = false): Promise<SessionCache> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache;

  if (config.igCookies) {
    const csrfToken = extractCookieValue(config.igCookies, "csrftoken");
    const sessionId = extractCookieValue(config.igCookies, "sessionid");
    cache = {
      cookies: config.igCookies,
      csrfToken,
      expiresAt: Number.MAX_SAFE_INTEGER,
      authenticated: !!sessionId,
    };
    logger.debug(
      {
        hasCsrf: !!csrfToken,
        hasSessionId: !!sessionId,
        cookieKeys: config.igCookies
          .split(";")
          .map((s) => s.trim().split("=")[0])
          .filter(Boolean),
      },
      "using IG_COOKIES from env",
    );
    return cache;
  }

  logger.debug("bootstrapping anonymous instagram session");
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

  cache = {
    cookies,
    csrfToken,
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
    "anonymous session ready",
  );
  return cache;
}

export function clearSession(): void {
  cache = null;
}
