/**
 * Strip session metadata from memory content:
 * - Individual session lines (Session Key, Session ID, Source)
 * - Full session header block: # Session: ... followed by - **Session Key**:, - **Session ID**:, - **Source**:
 */

function isSessionMetadataLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^below is a template\s*$/i.test(t)) return true;
  const normalized = t.replace(/^\s*#\s*/, "").replace(/^\*\*/, "");
  return (
    /^Session Key(\*\*)?\s*:\s*/i.test(normalized) ||
    /^Session ID(\*\*)?\s*:\s*/i.test(normalized) ||
    /^Session(\*\*)?\s*:\s*/i.test(normalized) ||
    /^Source(\*\*)?\s*:\s*/i.test(normalized)
  );
}

function isSessionBlockLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^\s*#\s*Session\s*:/i.test(t)) return true;
  const withoutList = t.replace(/^\s*-\s*/, "");
  return isSessionMetadataLine(withoutList);
}

/** Remove the full session header block (# Session: ... and list lines). */
export function stripSessionHeaderBlock(content: string): string {
  if (!content.trim()) return content;
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*#\s*Session\s*:/i.test(line.trim())) {
      i++;
      while (i < lines.length && isSessionBlockLine(lines[i])) i++;
      continue;
    }
    kept.push(line);
    i++;
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove individual session metadata lines (when not in a block). */
export function stripSessionTemplate(text: string): string {
  if (!text.trim()) return text;
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => !isSessionMetadataLine(line));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip both block and any remaining session lines. Use for display. */
export function stripSessionFromContent(content: string): string {
  return stripSessionTemplate(stripSessionHeaderBlock(content));
}
