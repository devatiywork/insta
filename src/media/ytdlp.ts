import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../logger.js";
import { MediaError, TooLargeError } from "./types.js";

const execFileAsync = promisify(execFile);

export const YTDLP_MAX_BYTES = 50 * 1024 * 1024;
export const YTDLP_MAX_FILESIZE_FLAG = "50M";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface YtDlpResult {
  data: Uint8Array;
  /** Имя файла, которым yt-dlp назвал результат (обычно "<id>.<ext>"). */
  filename: string;
  /** Распарсенный JSON метаданных из --print-json (или {}, если его нет). */
  info: Record<string, unknown>;
}

export interface YtDlpOptions {
  /** Селектор формата (-f). */
  format: string;
  /** Доп. аргументы перед URL, например ["--merge-output-format", "mp4"] или ["-x"]. */
  extraArgs?: string[];
  /** Какой файл во временной папке считать результатом. */
  filePattern: RegExp;
  /** Префикс временной папки. */
  tmpPrefix: string;
  /** Метка для логов. */
  label: string;
  timeoutMs?: number;
  /**
   * Классификатор stderr: бросает типизированную ошибку (NotFound/Private/…)
   * для известных случаев. Если ничего не бросил — хелпер сам кинет общий
   * MediaError/TooLargeError.
   */
  onError?: (stderr: string) => void;
}

/**
 * Скачивает медиа через yt-dlp во временную папку, читает результат в память
 * и подчищает за собой. Общая обвязка для всех платформ, использующих yt-dlp.
 */
export async function ytDlpDownload(
  url: string,
  opts: YtDlpOptions,
): Promise<YtDlpResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), opts.tmpPrefix));
  logger.debug({ url, tmpDir, label: opts.label }, "yt-dlp invoke");
  try {
    const args = [
      "-f",
      opts.format,
      ...(opts.extraArgs ?? []),
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--max-filesize",
      YTDLP_MAX_FILESIZE_FLAG,
      "--socket-timeout",
      "30",
      "--print-json",
      "-o",
      join(tmpDir, "%(id)s.%(ext)s"),
      url,
    ];

    let stdout: string;
    try {
      const result = await execFileAsync("yt-dlp", args, {
        maxBuffer: 8 * 1024 * 1024,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      stdout = result.stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        stderr?: string;
        stdout?: string;
      };
      const stderr = e.stderr ?? e.message ?? "";
      logger.warn(
        { label: opts.label, stderr: stderr.slice(0, 500) },
        "yt-dlp failed",
      );
      opts.onError?.(stderr);
      if (/File is larger than max-filesize/i.test(stderr)) {
        throw new TooLargeError(50);
      }
      throw new MediaError(`yt-dlp error: ${stderr.slice(0, 300) || "unknown"}`);
    }

    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
    const info = jsonLine
      ? (JSON.parse(jsonLine) as Record<string, unknown>)
      : {};

    const files = await readdir(tmpDir);
    const file = files.find((f) => opts.filePattern.test(f));
    if (!file) {
      logger.warn(
        { label: opts.label, tmpDir, files },
        "yt-dlp left no matching output file",
      );
      throw new MediaError("yt-dlp produced no output file");
    }
    const data = await readFile(join(tmpDir, file));
    if (data.length > YTDLP_MAX_BYTES) {
      throw new TooLargeError(data.length / (1024 * 1024));
    }
    return { data: new Uint8Array(data), filename: file, info };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch((err) =>
      logger.debug({ err, tmpDir, label: opts.label }, "yt-dlp tmp cleanup failed"),
    );
  }
}

/** Узкое приведение строкового поля из info yt-dlp. */
export function infoString(
  info: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = info[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

/** Узкое приведение числового поля из info yt-dlp. */
export function infoNumber(
  info: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = info[key];
  return typeof v === "number" ? v : undefined;
}
