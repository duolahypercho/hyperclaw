"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { FileText, Loader2, AlertCircle, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useDocsFloatingOS } from "@OS/Provider/OSProv";

export function FloatingDocViewer() {
  const { path, closeDoc } = useDocsFloatingOS();
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty = content !== originalContent;

  const loadDoc = useCallback(async (relativePath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("get-openclaw-doc", {
        relativePath,
      })) as { success?: boolean; content?: string; error?: string };
      if (res?.success && typeof res.content === "string") {
        setContent(res.content);
        setOriginalContent(res.content);
        setSaveError(null);
      } else {
        setContent("");
        setOriginalContent("");
        setError(res?.error ?? "Failed to load document");
      }
    } catch (e) {
      setContent("");
      setOriginalContent("");
      setError(e instanceof Error ? e.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    loadDoc(path);
  }, [path, loadDoc]);

  const handleSave = useCallback(async () => {
    if (!path || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = (await bridgeInvoke("write-openclaw-doc", {
        relativePath: path,
        content,
      })) as { success?: boolean; error?: string };
      if (result?.success) {
        setOriginalContent(content);
        setSaveError(null);
      } else {
        setSaveError(result?.error ?? "Failed to save");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [path, content, saving]);

  if (!path) return null;

  const docName = path.split("/").pop() ?? path;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col min-h-0 bg-background"
    >
      {/* Header: title + Save + Close */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {docName}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={isDirty ? "success" : "ghost"}
            size="iconSm"
            className={cn(
              "h-7 w-7",
              isDirty
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                : "text-muted-foreground"
            )}
            onClick={handleSave}
            disabled={saving || loading}
            title="Save"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            className="h-7 w-7"
            onClick={closeDoc}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-destructive px-3 py-1 bg-destructive/10 border-b border-border/50 shrink-0">
          {saveError}
        </p>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground py-8">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">Loading...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 text-destructive py-8 px-4">
            <AlertCircle className="h-10 w-10 opacity-80 mb-2" />
            <p className="text-sm font-medium">Could not load document</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Markdown content..."
              className="w-full min-h-full p-3 bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0 block"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
