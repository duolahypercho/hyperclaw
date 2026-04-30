"use client";

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

const COLLAPSE_THRESHOLD = 15;
const SUMMARY_LINES = 5;

/**
 * Syntax-highlights a JSON-formatted string using simple regex and Tailwind classes.
 * Returns an array of React elements with colored spans.
 */
function highlightJson(jsonString: string): React.ReactNode[] {
  const lines = jsonString.split("\n");
  return lines.map((line, i) => {
    // We process each line and replace JSON tokens with colored spans.
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Match key (quoted string followed by colon)
      const keyMatch = remaining.match(/^(\s*)"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:\s*)/);
      if (keyMatch) {
        parts.push(<span key={`ws-${i}-${keyIdx}`}>{keyMatch[1]}</span>);
        parts.push(
          <span key={`k-${i}-${keyIdx}`} className="text-foreground/70">
            &quot;{keyMatch[2]}&quot;
          </span>
        );
        parts.push(<span key={`col-${i}-${keyIdx}`}>{keyMatch[3]}</span>);
        remaining = remaining.slice(keyMatch[0].length);
        keyIdx++;
        continue;
      }

      // Match string value
      const strMatch = remaining.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (strMatch) {
        parts.push(
          <span key={`s-${i}-${keyIdx}`} className="text-emerald-600 dark:text-emerald-400">
            &quot;{strMatch[1]}&quot;
          </span>
        );
        remaining = remaining.slice(strMatch[0].length);
        keyIdx++;
        continue;
      }

      // Match number
      const numMatch = remaining.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
      if (numMatch) {
        parts.push(
          <span key={`n-${i}-${keyIdx}`} className="text-blue-600 dark:text-blue-400">
            {numMatch[1]}
          </span>
        );
        remaining = remaining.slice(numMatch[0].length);
        keyIdx++;
        continue;
      }

      // Match boolean / null
      const boolMatch = remaining.match(/^(true|false|null)/);
      if (boolMatch) {
        parts.push(
          <span key={`b-${i}-${keyIdx}`} className="text-purple-600 dark:text-purple-400">
            {boolMatch[1]}
          </span>
        );
        remaining = remaining.slice(boolMatch[0].length);
        keyIdx++;
        continue;
      }

      // Consume one character (brackets, commas, whitespace, etc.)
      parts.push(<span key={`c-${i}-${keyIdx}`}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
      keyIdx++;
    }

    return (
      <React.Fragment key={`line-${i}`}>
        {i > 0 && "\n"}
        {parts}
      </React.Fragment>
    );
  });
}

export const JsonViewer: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(() => {
    try {
      const obj = JSON.parse(content);
      return JSON.stringify(obj, null, 2);
    } catch {
      return null;
    }
  }, [content]);

  const isJson = parsed !== null;
  const displayText = isJson ? parsed : content;

  const lines = useMemo(() => displayText.split("\n"), [displayText]);
  const totalLines = lines.length;
  const isLarge = isJson && totalLines > COLLAPSE_THRESHOLD;

  const highlighted = useMemo(() => {
    if (!isJson) return null;
    return highlightJson(parsed);
  }, [isJson, parsed]);

  const summaryHighlighted = useMemo(() => {
    if (!isJson || !isLarge) return null;
    return highlightJson(lines.slice(0, SUMMARY_LINES).join("\n"));
  }, [isJson, isLarge, lines]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [displayText]);

  if (!isJson) {
    return (
      <pre className="whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
        {content}
      </pre>
    );
  }

  const copyButton = (
    <Button
      variant="ghost"
      size="iconSm"
      onClick={handleCopy}
      className={cn(
        "absolute top-1 right-1 h-5 w-5 opacity-0 group-hover/json:opacity-100 transition-opacity z-10",
        copied && "opacity-100"
      )}
      title="Copy"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </Button>
  );

  if (isLarge && !expanded) {
    return (
      <div className="relative group/json">
        {copyButton}
        <details
          open={false}
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open) {
              setExpanded(true);
            }
          }}
        >
          <summary className="cursor-pointer list-none">
            <pre className="whitespace-pre-wrap break-all text-xs font-mono">
              {summaryHighlighted}
            </pre>
            <span className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-0.5 inline-block cursor-pointer select-none">
              Show {totalLines - SUMMARY_LINES} more lines...
            </span>
          </summary>
        </details>
      </div>
    );
  }

  return (
    <div className="relative group/json">
      {copyButton}
      <pre className="whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto text-xs font-mono">
        {highlighted}
      </pre>
      {isLarge && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-0.5 cursor-pointer select-none"
        >
          Collapse
        </button>
      )}
    </div>
  );
};
