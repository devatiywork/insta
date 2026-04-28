function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function parseUserIds(name: string): ReadonlySet<number> {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return new Set();
  const ids = new Set<number>();
  for (const part of raw.split(/[,;\s]+/)) {
    if (!part) continue;
    const n = Number(part);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid user id in ${name}: "${part}"`);
    }
    ids.add(n);
  }
  return ids;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  apiRoot: optional("API_ROOT", "https://api.telegram.org"),
  logLevel: optional("LOG_LEVEL", "info"),
  igCookies: optional("IG_COOKIES", ""),
  allowedUserIds: parseUserIds("ALLOWED_USER_IDS"),
} as const;

export type Config = typeof config;
