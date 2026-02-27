"use client";

import React, { useMemo } from "react";
import { Calendar, Clock, FileText, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemoryTool, type MemoryDayEntry } from "./provider/memoryProvider";
import { wordCount, formatSize } from "./utils/journalGrouping";
import { stripSessionFromContent } from "./utils/sessionHeader";
import { InteractApp } from "@OS/InteractApp";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { cn } from "$/utils";
import { markdownComponents } from "@OS/utils/MarkdownComponents";

/** Matches line starting with time: "05:37 AM", "05:37", "## 05:37 AM", "02:02:38", "**02:02 PM** —" */
const TIME_LINE_REGEX =
  /^(\s*(?:##\s*)?(\*\*)?)(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)(\*\*)?(\s*[—\-:]\s*)?(.*)$/i;

/** Purple-only styling for merged day view. */
const MERGED_SECTION_BORDER = "border-purple-500";
const MERGED_SECTION_TIME_CLASS = "text-purple-500";

function parseJournalContent(content: string): { time?: string; title?: string; body: string }[] {
  if (!content.trim()) return [];
  const blocks: { time?: string; title?: string; body: string }[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(TIME_LINE_REGEX);
    if (m) {
      const time = (m[3] ?? "").trim();
      const afterTime = (m[6] ?? "").trim();
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(TIME_LINE_REGEX)) {
        bodyLines.push(lines[i]);
        i++;
      }
      blocks.push({
        time,
        title: afterTime || undefined,
        body: bodyLines.join("\n").trim(),
      });
    } else {
      const bodyLines: string[] = [line];
      i++;
      while (i < lines.length && !lines[i].match(TIME_LINE_REGEX)) {
        bodyLines.push(lines[i]);
        i++;
      }
      blocks.push({ body: bodyLines.join("\n").trim() });
    }
  }
  return blocks;
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

const memoryMarkdownWrapperClass =
  "text-sm leading-relaxed text-foreground/95 [&_*]:text-inherit [&_a]:text-primary [&_a]:underline [&_code]:bg-muted/50 [&_pre]:!bg-muted/30 [&_pre]:rounded-md [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:list-outside [&_ul]:list-outside";

/** Memory-specific markdown: headings + list layout like "Key Learnings Today" (numbered, bold sub-heads, bullets). */
const memoryMarkdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  ...markdownComponents,
  h1: ({ className, ...props }) => (
    <h1
      {...props}
      className={cn("text-lg font-semibold mt-6 mb-2 first:mt-0 text-foreground scroll-mt-4", className)}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      {...props}
      className={cn("text-base font-semibold mt-5 mb-2 first:mt-0 text-foreground scroll-mt-4", className)}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      {...props}
      className={cn("text-sm font-semibold mt-4 mb-1.5 first:mt-0 text-foreground scroll-mt-4", className)}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      {...props}
      className={cn("list-decimal list-outside pl-6 my-3 space-y-2 text-foreground/95 [&>li]:pl-1", className)}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      {...props}
      className={cn("list-disc list-outside pl-6 my-3 space-y-1.5 text-foreground/95 [&>li]:pl-1", className)}
    />
  ),
  li: ({ className, ...props }) => (
    <li {...props} className={cn("mb-1 pl-0.5 leading-relaxed", className)} />
  ),
  p: ({ className, ...props }) => (
    <p
      {...props}
      className={cn("block whitespace-pre-wrap my-2 first:mt-0 last:mb-0 text-sm leading-relaxed", className)}
    />
  ),
  strong: ({ className, ...props }) => (
    <strong {...props} className={cn("font-semibold text-foreground", className)} />
  ),
};

function MemoryMarkdown({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <div className={cn(memoryMarkdownWrapperClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={memoryMarkdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Format ISO date string to time like "2:02 PM". */
function formatFileTime(updatedAt?: string): string {
  if (!updatedAt) return "";
  try {
    return new Date(updatedAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/** Renders merged day content: split by ---, purple styling, big time headers (parsed or from file). */
function MergedDayContent({
  content,
  fileUpdatedAts,
}: {
  content: string;
  fileUpdatedAts?: string[];
}) {
  const sections = useMemo(
    () => content.split(/\n\n---\n\n/).map((s) => s.trim()).filter(Boolean),
    [content]
  );
  if (sections.length === 0) return null;
  return (
    <div className="space-y-8">
      {sections.map((sectionContent, sectionIndex) => {
        const blocks = parseJournalContent(sectionContent);
        const hasTimeStamps = blocks.some((b) => b.time);
        const fallbackTime =
          fileUpdatedAts?.[sectionIndex] != null
            ? formatFileTime(fileUpdatedAts[sectionIndex])
            : "";
        return (
          <section
            key={sectionIndex}
            className={cn(
              "rounded-r-md border-l-4 pl-4",
              MERGED_SECTION_BORDER,
              "bg-muted/10 py-3 pr-2"
            )}
          >
            {hasTimeStamps ? (
              <ul className="space-y-5 list-none">
                {blocks.map((block, idx) => (
                  <li key={idx}>
                    {block.time ? (
                      <div className="mb-3">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-xl font-semibold tabular-nums",
                              MERGED_SECTION_TIME_CLASS
                            )}
                          >
                            {block.time}
                          </span>
                          {block.title && (
                            <>
                              <span className="text-muted-foreground font-normal">—</span>
                              <span className="text-foreground/90 font-medium">{block.title}</span>
                            </>
                          )}
                        </div>
                        {block.body && (
                          <div className="mt-2 pl-0 text-muted-foreground">
                            <MemoryMarkdown content={stripSessionFromContent(block.body)} />
                          </div>
                        )}
                      </div>
                    ) : (
                      block.body && (
                        <div className="text-muted-foreground">
                          <MemoryMarkdown content={stripSessionFromContent(block.body)} />
                        </div>
                      )
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {fallbackTime && (
                  <div
                    className={cn(
                      "text-xl font-semibold tabular-nums mb-3",
                      MERGED_SECTION_TIME_CLASS
                    )}
                  >
                    {fallbackTime}
                  </div>
                )}
                <MemoryMarkdown content={sectionContent} />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function JournalContentView({
  path,
  content,
  name,
  updatedAt,
  sizeBytes,
  dayEntry,
  mergedContent,
  mergedLoading,
}: {
  path: string;
  content: string;
  name?: string;
  updatedAt?: string;
  sizeBytes?: number;
  dayEntry?: MemoryDayEntry | null;
  mergedContent?: string | null;
  mergedLoading?: boolean;
}) {
  // Merged day view: big header + all files for that day
  if (dayEntry) {
    const fullDateLabel =
      dayEntry.dateKey &&
      new Date(dayEntry.dateKey + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        <ScrollArea className="h-full">
          <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-4">
            <div className="mb-6 border-b border-border/50 pb-4">
              <h1 className="text-xl font-semibold text-foreground">
                {fullDateLabel || dayEntry.display}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {dayEntry.files.length} memory file{dayEntry.files.length !== 1 ? "s" : ""} merged
              </p>
            </div>
            {mergedLoading ? (
              <div className="flex items-center gap-3 py-8 text-muted-foreground">
                <div
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                  aria-hidden
                />
                <span className="text-sm">Loading merged memory…</span>
              </div>
            ) : mergedContent?.trim() ? (
              <MergedDayContent
                content={mergedContent}
                fileUpdatedAts={dayEntry.files.map((f) => f.updatedAt ?? "")}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No content for this day.</p>
            )}
          </div>
        </ScrollArea>
      </motion.div>
    );
  }

  if (!path) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-4">
        <motion.div {...fadeUp} className="w-full max-w-md">
          <Card className="border-dashed border-2 border-muted-foreground/20 bg-card/30">
            <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08 }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50"
              >
                <FileText className="h-8 w-8 text-muted-foreground" />
              </motion.div>
              <CardTitle className="text-base font-semibold text-foreground">
                Select a memory
              </CardTitle>
              <CardDescription className="mt-1.5 text-sm">
                Pick a day from the sidebar to read its journal, or use Generate
                Summary for today&apos;s TL;DR.
              </CardDescription>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }
 const filteredContent = useMemo(() => stripSessionFromContent(content), [content]);

  const blocks = useMemo(() => parseJournalContent(filteredContent), [filteredContent]);
  const hasTimeStamps = blocks.some((b) => b.time);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <ScrollArea className="h-full">
        <div
          className={cn(
            "rounded-lg border border-border/50 bg-muted/20 px-4 py-4 customScrollbar2",
            hasTimeStamps && "space-y-5"
          )}
        >
          {hasTimeStamps ? (
            <ul className="space-y-5">
              {blocks.map((block, idx) => (
                <li key={idx} className="list-none">
                  {block.time ? (
                    <div className="group">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground group-hover:text-primary transition-colors">
                          <Clock className="h-3.5 w-3.5" />
                        </span>
                        <span className="tabular-nums">{block.time}</span>
                        {block.title && (
                          <>
                            <span className="text-muted-foreground font-normal">—</span>
                            <span>{block.title}</span>
                          </>
                        )}
                      </div>
                      {block.body && (
                        <div className="mt-2 pl-8 text-muted-foreground">
                          <MemoryMarkdown content={stripSessionFromContent(block.body)} />
                        </div>
                      )}
                    </div>
                  ) : (
                    block.body && (
                      <div className="pl-8 text-muted-foreground">
                        <MemoryMarkdown content={stripSessionFromContent(block.body)} />
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <MemoryMarkdown content={filteredContent} />
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

export const Memory = () => {
  const {
    appSchema,
    selectedFile,
    selectedDayEntry,
    mergedDayContent,
    mergedDayLoading,
    todaySummary,
    todaySummaryLoading,
  } = useMemoryTool();

  const showDayView = !!selectedDayEntry;

  return (
    <InteractApp appSchema={appSchema} className="h-full w-full min-h-0 p-0">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <JournalContentView
            path={selectedFile?.path ?? ""}
            content={selectedFile?.content ?? ""}
            name={selectedFile?.name}
            updatedAt={selectedFile?.updatedAt}
            sizeBytes={selectedFile?.sizeBytes}
            dayEntry={showDayView ? selectedDayEntry : null}
            mergedContent={mergedDayContent}
            mergedLoading={mergedDayLoading}
          />
        </div>
      </div>
    </InteractApp>
  );
};

export default Memory;
