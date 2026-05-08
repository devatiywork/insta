import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../logger.js";
import {
  AuthRequiredError,
  MediaError,
  NotFoundError,
  PrivateContentError,
  TooLargeError,
  type ScrapeResult,
} from "../media/types.js";

const execFileAsync = promisify(execFile);

const MAX_BYTES = 50 * 1024 * 1024;
const TG_LIMIT_FLAG = "50M";

const FORMAT =
  "best[filesize<=49M]/best[filesize_approx<=49M]/" +
  "(bv*[height<=720][ext=mp4]+ba[ext=m4a])/best[height<=720]";

interface YtDlpInfo {
  id: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  width?: number;
  height?: number;
  webpage_url?: string;
}

function classifyError(stderr: string, url: string): never {
  const text = stderr.slice(0, 5000);
  if (/Private video|members[- ]only/i.test(text)) {
    throw new PrivateContentError(url);
  }
  if (/Sign in to confirm|age[- ]restricted|inappropriate for some users/i.test(text)) {
    throw new AuthRequiredError("youtube");
  }
  if (/Video unavailable|HTTP Error 404|does not exist|removed/i.test(text)) {
    throw new NotFoundError(url);
  }
  if (
    /File is larger than max-filesize|Requested format is not available/i.test(
      text,
    )
  ) {
    throw new TooLargeError(50);
  }
  throw new MediaError(`yt-dlp error: ${text.slice(0, 300) || "unknown"}`);
}

export async function scrape(url: string): Promise<ScrapeResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "yt-"));
  logger.debug({ url, tmpDir }, "youtube: yt-dlp invoke");
  try {
    const args = [
      "-f", FORMAT,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--max-filesize", TG_LIMIT_FLAG,
      "--socket-timeout", "30",
      "--print-json",
      "-o", join(tmpDir, "%(id)s.%(ext)s"),
      url,
    ];

    let stdout: string;
    try {
      const result = await execFileAsync("yt-dlp", args, {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      });
      stdout = result.stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        stderr?: string;
        stdout?: string;
      };
      classifyError(e.stderr ?? e.message ?? "", url);
    }

    const lines = stdout!.split(/\r?\n/).filter(Boolean);
    const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
    if (!jsonLine) {
      throw new MediaError("yt-dlp did not return JSON metadata");
    }
    let info: YtDlpInfo;
    try {
      info = JSON.parse(jsonLine) as YtDlpInfo;
    } catch (err) {
      throw new MediaError("yt-dlp JSON parse failed", err);
    }

    const files = await readdir(tmpDir);
    const videoFile = files.find((f) =>
      /\.(mp4|mkv|webm|mov)$/i.test(f),
    );
    if (!videoFile) {
      logger.warn({ url, tmpDir, files }, "yt-dlp left no video file");
      throw new MediaError("yt-dlp produced no output file");
    }
    const data = await readFile(join(tmpDir, videoFile));
    if (data.length > MAX_BYTES) {
      throw new TooLargeError(data.length / (1024 * 1024));
    }

    logger.debug(
      {
        id: info.id,
        sizeMb: (data.length / (1024 * 1024)).toFixed(1),
        file: videoFile,
        duration: info.duration,
      },
      "youtube: scrape ok",
    );

    return {
      platform: "youtube",
      shortcode: info.id,
      caption: info.title,
      author: info.uploader ?? info.channel,
      items: [
        {
          kind: "video",
          data: new Uint8Array(data),
          filename: `${info.id}.mp4`,
          width: info.width,
          height: info.height,
          durationSec: info.duration,
        },
      ],
      source: "youtube-ytdlp",
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch((err) => {
      logger.debug({ err, tmpDir }, "youtube: tmp cleanup failed");
    });
  }
}
