/**
 * Helpers for journal-style grouping of memory files by date.
 */

export interface MemoryFileForGrouping {
  name: string;
  path: string;
  content: string;
  updatedAt?: string;
  sizeBytes?: number;
}

/** Matches filenames that are daily journals (one per day): known patterns + any file with YYYY-MM-DD. */
const SUMMARIZED_DAILY_PATTERNS = [
  /^journal-by-hours-\d{4}-\d{2}-\d{2}\.(md|txt)$/i,
  /^daily[-_]?\d{4}-\d{2}-\d{2}\.(md|txt)$/i,
  /^journal[-_]?\d{4}-\d{2}-\d{2}\.(md|txt)$/i,
  // Any .md/.txt file with a date in the name (e.g. 2026-02-17.md, session-2026-02-17.md)
  /^\d{4}-\d{2}-\d{2}\.(md|txt)$/i,
  /.\d{4}-\d{2}-\d{2}\.(md|txt)$/i,
];

export function isSummarizedDailyFile(file: MemoryFileForGrouping): boolean {
  const name = file.name || "";
  if (SUMMARIZED_DAILY_PATTERNS.some((re) => re.test(name))) return true;
  // Fallback: any filename that contains YYYY-MM-DD (e.g. in subdirs or with prefix)
  return /\d{4}-\d{2}-\d{2}/.test(name) && /\.(md|txt)$/i.test(name);
}

export function getFileDate(file: MemoryFileForGrouping): string {
  if (file.updatedAt) {
    return file.updatedAt.slice(0, 10);
  }
  const match = file.name.match(/daily[-_]?(\d{4}-\d{2}-\d{2})/i) || file.name.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return "";
}

export function wordCount(content: string): number {
  return (content || "").trim().split(/\s+/).filter(Boolean).length;
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type SectionKind = "yesterday" | "thisWeek" | "thisMonth" | "month" | "other";

export interface DateEntry {
  dateKey: string;
  display: string;
  files: MemoryFileForGrouping[];
}

export interface JournalSection {
  kind: SectionKind;
  title: string;
  count: number;
  entries: DateEntry[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getStartOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function dateStringToMs(dateStr: string): number {
  return getStartOfDay(new Date(dateStr)).getTime();
}

export function groupFilesByDate(files: MemoryFileForGrouping[]): JournalSection[] {
  const now = new Date();
  const todayStart = getStartOfDay(now).getTime();
  const yesterdayStart = todayStart - ONE_DAY_MS;
  const weekStart = todayStart - 7 * ONE_DAY_MS;
  const monthStart = todayStart - 31 * ONE_DAY_MS;

  const byDateKey = new Map<string, MemoryFileForGrouping[]>();
  const noDateFiles: MemoryFileForGrouping[] = [];
  for (const file of files) {
    const key = getFileDate(file);
    if (!key) {
      noDateFiles.push(file);
      continue;
    }
    if (!byDateKey.has(key)) byDateKey.set(key, []);
    byDateKey.get(key)!.push(file);
  }

  const sortedKeys = Array.from(byDateKey.keys()).sort((a, b) => b.localeCompare(a));

  const yesterday: DateEntry[] = [];
  const thisWeek: DateEntry[] = [];
  const thisMonth: DateEntry[] = [];
  const byMonth = new Map<string, DateEntry[]>();

  for (const dateKey of sortedKeys) {
    const fileList = byDateKey.get(dateKey)!;
    const ts = dateStringToMs(dateKey);
    const d = new Date(dateKey);
    const monthLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const shortLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const entry: DateEntry = { dateKey, display: shortLabel, files: fileList };

    if (ts >= yesterdayStart && ts < todayStart) {
      yesterday.push(entry);
    } else if (ts >= weekStart) {
      thisWeek.push(entry);
    } else if (ts >= monthStart) {
      thisMonth.push(entry);
    } else {
      if (!byMonth.has(monthLabel)) byMonth.set(monthLabel, []);
      byMonth.get(monthLabel)!.push(entry);
    }
  }

  const sections: JournalSection[] = [];
  if (yesterday.length > 0) {
    sections.push({ kind: "yesterday", title: "Yesterday", count: yesterday.reduce((n, e) => n + e.files.length, 0), entries: yesterday });
  }
  if (thisWeek.length > 0) {
    sections.push({ kind: "thisWeek", title: "This Week", count: thisWeek.reduce((n, e) => n + e.files.length, 0), entries: thisWeek });
  }
  if (thisMonth.length > 0) {
    sections.push({ kind: "thisMonth", title: "This Month", count: thisMonth.reduce((n, e) => n + e.files.length, 0), entries: thisMonth });
  }
  const monthLabels = Array.from(byMonth.keys()).sort((a, b) => {
    const entriesA = byMonth.get(a) ?? [];
    const entriesB = byMonth.get(b) ?? [];
    const firstA = entriesA[0]?.dateKey ?? "";
    const firstB = entriesB[0]?.dateKey ?? "";
    return firstB.localeCompare(firstA);
  });
  for (const monthLabel of monthLabels) {
    const entries = byMonth.get(monthLabel)!;
    sections.push({ kind: "month", title: monthLabel, count: entries.reduce((n, e) => n + e.files.length, 0), entries });
  }
  if (noDateFiles.length > 0) {
    sections.push({
      kind: "other",
      title: "Other",
      count: noDateFiles.length,
      entries: [{ dateKey: "", display: "Other", files: noDateFiles }],
    });
  }

  return sections;
}

export function findLongTermMemoryFile(files: MemoryFileForGrouping[]): MemoryFileForGrouping | null {
  return files.find((f) => /long[-_]?term/i.test(f.name) || f.name.toLowerCase().includes("long-term")) || null;
}
