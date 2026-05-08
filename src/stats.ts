import { getDb } from "./db.js";
import type { Platform } from "./media/types.js";

export interface PlatformCount {
  platform: Platform;
  count: number;
}

export interface TopUserRow {
  userId: number;
  username: string | null;
  count: number;
  lastTs: number;
}

export interface RecentErrorRow {
  ts: number;
  userId: number | null;
  username: string | null;
  platform: string | null;
  errorName: string | null;
  errorMsg: string | null;
}

export interface StatsSummary {
  total: number;
  byPlatform: PlatformCount[];
  topUsers: TopUserRow[];
  recentErrors: RecentErrorRow[];
}

export function recordDownload(
  userId: number,
  username: string | undefined,
  platform: Platform,
): void {
  getDb()
    .prepare(
      "INSERT INTO downloads (user_id, username, platform) VALUES (?, ?, ?)",
    )
    .run(userId, username ?? null, platform);
}

export function recordError(args: {
  userId?: number;
  username?: string;
  platform?: Platform | null;
  errorName?: string;
  errorMsg?: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO errors (user_id, username, platform, error_name, error_msg) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      args.userId ?? null,
      args.username ?? null,
      args.platform ?? null,
      args.errorName ?? null,
      args.errorMsg?.slice(0, 500) ?? null,
    );
}

export function getStatsSummary(topN = 10, errorsN = 5): StatsSummary {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM downloads").get() as { n: number }
  ).n;

  const byPlatform = db
    .prepare(
      "SELECT platform, COUNT(*) AS count FROM downloads GROUP BY platform ORDER BY count DESC",
    )
    .all() as PlatformCount[];

  const topUsers = db
    .prepare(
      `SELECT
         user_id   AS userId,
         MAX(username) AS username,
         COUNT(*)  AS count,
         MAX(ts)   AS lastTs
       FROM downloads
       GROUP BY user_id
       ORDER BY count DESC
       LIMIT ?`,
    )
    .all(topN) as TopUserRow[];

  const recentErrors = db
    .prepare(
      `SELECT
         ts,
         user_id    AS userId,
         username,
         platform,
         error_name AS errorName,
         error_msg  AS errorMsg
       FROM errors
       ORDER BY ts DESC
       LIMIT ?`,
    )
    .all(errorsN) as RecentErrorRow[];

  return { total, byPlatform, topUsers, recentErrors };
}
