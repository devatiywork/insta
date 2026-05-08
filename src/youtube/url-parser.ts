const URL_IN_TEXT_RE =
  /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S+/i;

export function findYouTubeUrl(text: string): string | null {
  const match = text.match(URL_IN_TEXT_RE);
  return match ? match[0] : null;
}
