import { getDb } from "./db.js";

export interface UserPrefs {
  igCaption: boolean;
  ttCaption: boolean;
  ytCaption: boolean;
}

export interface AllowedUserRow {
  userId: number;
  username: string | null;
  addedAt: number;
}

const DEFAULT_PREFS: UserPrefs = {
  igCaption: true,
  ttCaption: true,
  ytCaption: true,
};

export function listAllowedUsers(): AllowedUserRow[] {
  const rows = getDb()
    .prepare(
      "SELECT user_id AS userId, username, added_at AS addedAt FROM allowed_users ORDER BY added_at ASC",
    )
    .all() as AllowedUserRow[];
  return rows;
}

export function isInAllowlist(userId: number): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM allowed_users WHERE user_id = ?")
    .get(userId);
  return row !== undefined;
}

export function addAllowedUser(userId: number, username?: string): boolean {
  const result = getDb()
    .prepare(
      "INSERT INTO allowed_users (user_id, username) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING",
    )
    .run(userId, username ?? null);
  return result.changes > 0;
}

export function removeAllowedUser(userId: number): boolean {
  const tx = getDb().transaction(() => {
    const r = getDb()
      .prepare("DELETE FROM allowed_users WHERE user_id = ?")
      .run(userId);
    getDb().prepare("DELETE FROM user_prefs WHERE user_id = ?").run(userId);
    return r.changes > 0;
  });
  return tx();
}

export function touchAllowedUser(userId: number, username?: string): void {
  if (!username) return;
  getDb()
    .prepare(
      "UPDATE allowed_users SET username = ? WHERE user_id = ? AND IFNULL(username, '') <> ?",
    )
    .run(username, userId, username);
}

interface PrefsRow {
  ig_caption: number;
  tt_caption: number;
  yt_caption: number;
}

export function getPrefs(userId: number): UserPrefs {
  const row = getDb()
    .prepare(
      "SELECT ig_caption, tt_caption, yt_caption FROM user_prefs WHERE user_id = ?",
    )
    .get(userId) as PrefsRow | undefined;
  if (!row) return { ...DEFAULT_PREFS };
  return {
    igCaption: row.ig_caption !== 0,
    ttCaption: row.tt_caption !== 0,
    ytCaption: row.yt_caption !== 0,
  };
}

export function setPrefs(
  userId: number,
  patch: Partial<UserPrefs>,
): UserPrefs {
  const current = getPrefs(userId);
  const next: UserPrefs = { ...current, ...patch };
  getDb()
    .prepare(
      `INSERT INTO user_prefs (user_id, ig_caption, tt_caption, yt_caption)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         ig_caption = excluded.ig_caption,
         tt_caption = excluded.tt_caption,
         yt_caption = excluded.yt_caption`,
    )
    .run(
      userId,
      next.igCaption ? 1 : 0,
      next.ttCaption ? 1 : 0,
      next.ytCaption ? 1 : 0,
    );
  return next;
}
