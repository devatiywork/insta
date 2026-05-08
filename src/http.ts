import { logger } from "./logger.js";

const DEFAULT_TIMEOUT_MS = 15_000;

const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
];

export function pickUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index] ?? USER_AGENTS[0]!;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
}

export async function fetchText(
  url: string,
  options: FetchOptions = {},
): Promise<{ status: number; body: string }> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    userAgent,
  } = options;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const ua = userAgent ?? pickUserAgent();
    const startedAt = Date.now();
    logger.debug({ url, attempt, userAgent: ua }, "http request");
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": ua,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          ...headers,
        },
      });
      const body = await res.text();
      const elapsedMs = Date.now() - startedAt;
      logger.debug(
        {
          url,
          attempt,
          status: res.status,
          contentType: res.headers.get("content-type"),
          bodyLength: body.length,
          elapsedMs,
        },
        "http response",
      );
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      return { status: res.status, body };
    } catch (err) {
      lastErr = err;
      logger.debug(
        { url, attempt, err: (err as Error).message },
        "http attempt failed",
      );
      if (attempt === retries) break;
      const delay = 400 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
