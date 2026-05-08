import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

export interface UserPrefs {
  igCaption: boolean;
  ttCaption: boolean;
}

interface Store {
  allowedUsers: number[];
  userPrefs: Record<string, UserPrefs>;
}

const DEFAULT_PREFS: UserPrefs = { igCaption: true, ttCaption: true };

let store: Store = { allowedUsers: [], userPrefs: {} };
let writeChain: Promise<void> = Promise.resolve();

function clone(): Store {
  return {
    allowedUsers: [...store.allowedUsers],
    userPrefs: Object.fromEntries(
      Object.entries(store.userPrefs).map(([k, v]) => [k, { ...v }]),
    ),
  };
}

async function persist(): Promise<void> {
  const snapshot = clone();
  writeChain = writeChain.then(async () => {
    const json = JSON.stringify(snapshot, null, 2);
    const tmp = `${config.storagePath}.tmp`;
    await fs.mkdir(dirname(config.storagePath), { recursive: true });
    await fs.writeFile(tmp, json, "utf-8");
    await fs.rename(tmp, config.storagePath);
  });
  return writeChain;
}

export async function loadStorage(): Promise<void> {
  try {
    const raw = await fs.readFile(config.storagePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    store = {
      allowedUsers: Array.isArray(parsed.allowedUsers)
        ? parsed.allowedUsers.filter((n) => Number.isInteger(n) && n > 0)
        : [],
      userPrefs:
        parsed.userPrefs && typeof parsed.userPrefs === "object"
          ? parsed.userPrefs
          : {},
    };
    logger.info(
      {
        path: config.storagePath,
        allowedCount: store.allowedUsers.length,
        prefsCount: Object.keys(store.userPrefs).length,
      },
      "storage loaded",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.info({ path: config.storagePath }, "storage file missing, starting fresh");
      await persist();
      return;
    }
    throw err;
  }
}

export function listAllowedUsers(): number[] {
  return [...store.allowedUsers];
}

export function isInAllowlist(userId: number): boolean {
  return store.allowedUsers.includes(userId);
}

export async function addAllowedUser(userId: number): Promise<boolean> {
  if (store.allowedUsers.includes(userId)) return false;
  store.allowedUsers.push(userId);
  await persist();
  return true;
}

export async function removeAllowedUser(userId: number): Promise<boolean> {
  const idx = store.allowedUsers.indexOf(userId);
  if (idx < 0) return false;
  store.allowedUsers.splice(idx, 1);
  delete store.userPrefs[String(userId)];
  await persist();
  return true;
}

export function getPrefs(userId: number): UserPrefs {
  const existing = store.userPrefs[String(userId)];
  return existing ? { ...existing } : { ...DEFAULT_PREFS };
}

export async function setPrefs(
  userId: number,
  patch: Partial<UserPrefs>,
): Promise<UserPrefs> {
  const current = getPrefs(userId);
  const next = { ...current, ...patch };
  store.userPrefs[String(userId)] = next;
  await persist();
  return next;
}
