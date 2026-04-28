const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function shortcodeToMediaId(shortcode: string): string {
  let id = 0n;
  for (const char of shortcode) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error(`Invalid character in shortcode: ${char}`);
    }
    id = id * 64n + BigInt(value);
  }
  return id.toString();
}
