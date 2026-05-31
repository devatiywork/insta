import { logger } from "../logger.js";
import {
  AuthRequiredError,
  NotFoundError,
  PrivateContentError,
  TooLargeError,
  type ScrapeResult,
} from "../media/types.js";
import { infoNumber, infoString, ytDlpDownload } from "../media/ytdlp.js";

const FORMAT =
  "best[filesize<=49M]/best[filesize_approx<=49M]/" +
  "(bv*[height<=720][ext=mp4]+ba[ext=m4a])/best[height<=720]";

function classifyError(stderr: string, url: string): void {
  const text = stderr.slice(0, 5000);
  if (/Private video|members[- ]only/i.test(text)) {
    throw new PrivateContentError(url);
  }
  if (
    /Sign in to confirm|age[- ]restricted|inappropriate for some users/i.test(
      text,
    )
  ) {
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
  // Неизвестный stderr — пусть хелпер кинет общий MediaError.
}

export async function scrape(url: string): Promise<ScrapeResult> {
  const { data, filename, info } = await ytDlpDownload(url, {
    format: FORMAT,
    extraArgs: ["--merge-output-format", "mp4"],
    filePattern: /\.(mp4|mkv|webm|mov)$/i,
    tmpPrefix: "yt-",
    label: "youtube",
    onError: (stderr) => classifyError(stderr, url),
  });

  const id = infoString(info, "id") ?? filename.replace(/\.[^.]+$/, "");
  logger.debug(
    {
      id,
      sizeMb: (data.length / (1024 * 1024)).toFixed(1),
      file: filename,
      duration: infoNumber(info, "duration"),
    },
    "youtube: scrape ok",
  );

  return {
    platform: "youtube",
    shortcode: id,
    caption: infoString(info, "title"),
    author: infoString(info, "uploader", "channel"),
    items: [
      {
        kind: "video",
        data,
        filename,
        width: infoNumber(info, "width"),
        height: infoNumber(info, "height"),
        durationSec: infoNumber(info, "duration"),
      },
    ],
    source: "youtube-ytdlp",
  };
}
