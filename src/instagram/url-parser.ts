const SHORTCODE_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;

const URL_IN_TEXT_RE =
  /https?:\/\/(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/\S+/i;

export function findInstagramUrl(text: string): string | null {
  const match = text.match(URL_IN_TEXT_RE);
  return match ? match[0] : null;
}

export function extractShortcode(url: string): string | null {
  const match = url.match(SHORTCODE_RE);
  return match && match[2] ? match[2] : null;
}

export async function resolveShareUrl(url: string): Promise<string> {
  if (!/\/share\//i.test(url)) return url;
  const res = await fetch(url, { redirect: "follow" });
  return res.url ?? url;
}
