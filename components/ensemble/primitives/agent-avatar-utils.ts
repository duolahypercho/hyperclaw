export const DEFAULT_AGENT_EMOJI = "🤖";

export function firstCharUpper(s: string | undefined): string {
  const c = s?.trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

export function isNameInitialGlyph(value: string | undefined, fallbackSeed: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length !== 1) return false;
  return trimmed.toUpperCase() === firstCharUpper(fallbackSeed);
}

export function normalizeRealAgentEmoji(rawEmoji: string | undefined, fallbackSeed: string | undefined): string {
  const trimmedEmoji = rawEmoji?.trim();

  if (!trimmedEmoji || isNameInitialGlyph(trimmedEmoji, fallbackSeed)) {
    return DEFAULT_AGENT_EMOJI;
  }

  return trimmedEmoji;
}
