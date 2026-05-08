import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { logger } from "./logger.js";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS allowed_users (
  user_id   INTEGER PRIMARY KEY,
  username  TEXT,
  added_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id    INTEGER PRIMARY KEY,
  ig_caption INTEGER NOT NULL DEFAULT 1,
  tt_caption INTEGER NOT NULL DEFAULT 1,
  yt_caption INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS downloads (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  username  TEXT,
  platform  TEXT NOT NULL,
  ts        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_downloads_ts       ON downloads(ts);
CREATE INDEX IF NOT EXISTS idx_downloads_user     ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads(platform);

CREATE TABLE IF NOT EXISTS errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  username    TEXT,
  platform    TEXT,
  error_name  TEXT,
  error_msg   TEXT,
  ts          INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts DESC);
`;

const ERRORS_RETENTION_DAYS = 30;

export function getDb(): Database.Database {
  if (!db) throw new Error("DB not initialised — call initDb() first");
  return db;
}

export async function initDb(): Promise<void> {
  await fs.mkdir(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const cutoff = Math.floor(Date.now() / 1000) - ERRORS_RETENTION_DAYS * 86400;
  const removed = db.prepare("DELETE FROM errors WHERE ts < ?").run(cutoff).changes;
  if (removed > 0) {
    logger.debug({ removed, cutoffDays: ERRORS_RETENTION_DAYS }, "pruned old errors");
  }

  await maybeMigrateFromJson(db);

  logger.info({ path: config.dbPath }, "db ready");
}

export function closeDb(): void {
  db?.close();
  db = null;
}

interface LegacyStore {
  allowedUsers?: number[];
  userPrefs?: Record<string, { igCaption?: boolean; ttCaption?: boolean }>;
}

async function maybeMigrateFromJson(database: Database.Database): Promise<void> {
  const jsonPath = join(dirname(config.dbPath), "storage.json");
  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  let parsed: LegacyStore;
  try {
    parsed = JSON.parse(raw) as LegacyStore;
  } catch (err) {
    logger.warn({ err, jsonPath }, "legacy storage.json is corrupted, skipping migration");
    return;
  }

  const insertUser = database.prepare(
    "INSERT OR IGNORE INTO allowed_users (user_id) VALUES (?)",
  );
  const upsertPrefs = database.prepare(`
    INSERT INTO user_prefs (user_id, ig_caption, tt_caption)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ig_caption = excluded.ig_caption,
      tt_caption = excluded.tt_caption
  `);

  const tx = database.transaction(() => {
    for (const userId of parsed.allowedUsers ?? []) {
      if (Number.isInteger(userId) && userId > 0) {
        insertUser.run(userId);
      }
    }
    for (const [key, value] of Object.entries(parsed.userPrefs ?? {})) {
      const userId = Number(key);
      if (!Number.isInteger(userId) || userId <= 0) continue;
      upsertPrefs.run(
        userId,
        value.igCaption === false ? 0 : 1,
        value.ttCaption === false ? 0 : 1,
      );
    }
  });
  tx();

  await fs.rename(jsonPath, jsonPath + ".migrated");
  logger.info(
    {
      from: jsonPath,
      allowedUsers: parsed.allowedUsers?.length ?? 0,
      prefs: Object.keys(parsed.userPrefs ?? {}).length,
    },
    "migrated legacy storage.json into sqlite",
  );
}
