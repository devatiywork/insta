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

export const config = {
  botToken: required("BOT_TOKEN"),
  apiRoot: optional("API_ROOT", "https://api.telegram.org"),
  logLevel: optional("LOG_LEVEL", "info"),
} as const;

export type Config = typeof config;
