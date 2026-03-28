"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Play, X, History } from "lucide-react";
import { useIntel } from "./provider/intelligenceProvider";

const HISTORY_KEY = "intel-sql-history";
const MAX_HISTORY = 20;

function getHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addToHistory(sql: string) {
  const h = getHistory().filter((s) => s !== sql);
  h.unshift(sql);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}

export function SqlConsole() {
  const { runQuery, sqlConsoleOpen, setSqlConsoleOpen } = useIntel();
  const [sql, setSql] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (sqlConsoleOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [sqlConsoleOpen]);

  const execute = useCallback(async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setQueryError(null);
    try {
      const res = await runQuery(sql.trim());
      if (res.error) {
        setQueryError(res.error);
        setResults(null);
      } else {
        setResults(res.rows ?? []);
        addToHistory(sql.trim());
      }
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }, [sql, runQuery]);

  if (!sqlConsoleOpen) return null;

  const history = getHistory();
  const resultCols = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="border-solid border-t border-r-0 border-b-0 border-l-0 border-border/50 bg-background flex flex-col" style={{ height: 280 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30">
        <span className="text-xs font-medium text-muted-foreground">SQL Console</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Query history"
          >
            <History className="h-3 w-3" />
          </button>
          <button
            onClick={() => setSqlConsoleOpen(false)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div className="border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 max-h-24 overflow-y-auto">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setSql(h);
                setShowHistory(false);
              }}
              className="block w-full text-left px-3 py-1 text-[11px] font-mono text-muted-foreground hover:bg-muted/50 truncate"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 px-3 py-2 shrink-0">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              execute();
            }
          }}
          placeholder="SELECT * FROM companies WHERE type = 'competitor'"
          className="flex-1 px-2 py-1.5 bg-muted/30 border border-solid border-border/50 rounded text-xs font-mono text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          rows={2}
        />
        <button
          onClick={execute}
          disabled={running || !sql.trim()}
          className="self-end px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
        >
          <Play className="h-3 w-3" />
          {running ? "Running..." : "Run"}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-3 pb-2">
        {queryError && (
          <div className="text-xs text-red-400 px-2 py-1 bg-red-500/10 rounded">
            {queryError}
          </div>
        )}
        {results && (
          <div className="text-xs">
            <div className="text-muted-foreground mb-1">
              {results.length} row{results.length !== 1 ? "s" : ""}
            </div>
            {results.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr>
                    {resultCols.map((col) => (
                      <th
                        key={col}
                        className="px-2 py-1 text-left font-medium text-muted-foreground border-solid border-b border-t-0 border-r-0 border-l-0 border-border/30 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i} className="border-solid border-b border-t-0 border-r-0 border-l-0 border-border/10">
                      {resultCols.map((col) => (
                        <td
                          key={col}
                          className="px-2 py-1 text-foreground max-w-[200px] truncate"
                          title={row[col] != null ? String(row[col]) : "null"}
                        >
                          {row[col] != null ? String(row[col]) : (
                            <span className="text-muted-foreground/50 italic">null</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
