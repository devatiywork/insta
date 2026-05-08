import { execFile } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../logger.js";
import { scrapeByPlatform } from "./dispatch.js";
import {
  type AudioInfo,
  type Platform,
  MediaError,
  TooLargeError,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 50 * 1024 * 1024;
const SUBPROCESS_TIMEOUT_MS = 5 * 60 * 1000;

export interface AudioFile {
  data: Uint8Array;
  filename: string;
  title?: string;
  performer?: string;
  durationSec?: number;
}

export async function extractAudio(
  url: string,
  platform: Platform,
): Promise<AudioFile> {
  if (platform === "youtube") return extractYouTubeAudio(url);

  const result = await scrapeByPlatform({ platform, url });

  if (result.audio?.url) {
    return downloadDirectAudio(result.audio);
  }

  const video = result.items.find((i) => i.kind === "video" && !!i.url);
  if (!video || !video.url) {
    throw new MediaError("No video/audio source available for this post");
  }
  return ffmpegExtractFromUrl(video.url, video.fetchHeaders, {
    title: result.caption?.slice(0, 80),
    performer: result.author,
    durationSec: video.durationSec,
    baseFilename: result.shortcode,
  });
}

async function downloadDirectAudio(audio: AudioInfo): Promise<AudioFile> {
  if (!audio.url) throw new MediaError("Audio URL not present");
  logger.debug({ url: audio.url }, "audio: direct download");
  const res = await fetch(audio.url, { headers: audio.fetchHeaders });
  if (!res.ok) {
    throw new MediaError(`Failed to fetch audio: HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new TooLargeError(buf.length / (1024 * 1024));
  }
  return {
    data: buf,
    filename: audio.filename ?? "audio.mp3",
    title: audio.title,
    performer: audio.artist,
    durationSec: audio.durationSec,
  };
}

async function ffmpegExtractFromUrl(
  videoUrl: string,
  fetchHeaders: Record<string, string> | undefined,
  meta: {
    title?: string;
    performer?: string;
    durationSec?: number;
    baseFilename: string;
  },
): Promise<AudioFile> {
  const tmp = await mkdtemp(join(tmpdir(), "audio-"));
  try {
    const videoPath = join(tmp, "in.mp4");
    const audioPath = join(tmp, "out.m4a");

    logger.debug({ videoUrl, hasHeaders: !!fetchHeaders }, "audio: fetch video for ffmpeg");
    const res = await fetch(videoUrl, { headers: fetchHeaders });
    if (!res.ok) {
      throw new MediaError(`Failed to fetch video for audio extract: HTTP ${res.status}`);
    }
    const videoBuf = new Uint8Array(await res.arrayBuffer());
    await writeFile(videoPath, videoBuf);

    try {
      await execFileAsync(
        "ffmpeg",
        ["-y", "-i", videoPath, "-vn", "-acodec", "copy", audioPath],
        { timeout: 60_000 },
      );
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "audio: ffmpeg copy failed, falling back to mp3 re-encode",
      );
      const mp3Path = join(tmp, "out.mp3");
      await execFileAsync(
        "ffmpeg",
        ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-ab", "192k", mp3Path],
        { timeout: 120_000 },
      );
      const mp3Data = await readFile(mp3Path);
      if (mp3Data.length > MAX_BYTES) {
        throw new TooLargeError(mp3Data.length / (1024 * 1024));
      }
      return {
        data: new Uint8Array(mp3Data),
        filename: `${meta.baseFilename}.mp3`,
        title: meta.title,
        performer: meta.performer,
        durationSec: meta.durationSec,
      };
    }

    const data = await readFile(audioPath);
    if (data.length > MAX_BYTES) {
      throw new TooLargeError(data.length / (1024 * 1024));
    }
    return {
      data: new Uint8Array(data),
      filename: `${meta.baseFilename}.m4a`,
      title: meta.title,
      performer: meta.performer,
      durationSec: meta.durationSec,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch((err) =>
      logger.debug({ err, tmp }, "audio: tmp cleanup failed"),
    );
  }
}

async function extractYouTubeAudio(url: string): Promise<AudioFile> {
  const tmp = await mkdtemp(join(tmpdir(), "yt-audio-"));
  try {
    const args = [
      "-f", "bestaudio[filesize<=49M]/bestaudio",
      "-x",
      "--audio-format", "m4a",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--max-filesize", "50M",
      "--socket-timeout", "30",
      "--print-json",
      "-o", join(tmp, "%(id)s.%(ext)s"),
      url,
    ];

    let stdout: string;
    try {
      const result = await execFileAsync("yt-dlp", args, {
        maxBuffer: 8 * 1024 * 1024,
        timeout: SUBPROCESS_TIMEOUT_MS,
      });
      stdout = result.stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      const stderr = e.stderr ?? e.message ?? "";
      logger.warn({ stderr: stderr.slice(0, 500) }, "yt-dlp audio failed");
      if (/File is larger than max-filesize/i.test(stderr)) {
        throw new TooLargeError(50);
      }
      throw new MediaError(`yt-dlp audio failed: ${stderr.slice(0, 200)}`);
    }

    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
    const info = jsonLine ? (JSON.parse(jsonLine) as Record<string, unknown>) : {};

    const files = await readdir(tmp);
    const audioFile = files.find((f) => /\.(m4a|mp3|opus|webm)$/i.test(f));
    if (!audioFile) {
      throw new MediaError("yt-dlp produced no audio file");
    }
    const data = await readFile(join(tmp, audioFile));
    if (data.length > MAX_BYTES) {
      throw new TooLargeError(data.length / (1024 * 1024));
    }
    return {
      data: new Uint8Array(data),
      filename: audioFile,
      title: typeof info.title === "string" ? info.title : undefined,
      performer:
        (typeof info.uploader === "string" && info.uploader) ||
        (typeof info.channel === "string" && info.channel) ||
        undefined,
      durationSec:
        typeof info.duration === "number" ? info.duration : undefined,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch((err) =>
      logger.debug({ err, tmp }, "yt-audio: tmp cleanup failed"),
    );
  }
}
