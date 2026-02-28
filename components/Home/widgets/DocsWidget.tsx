"use client";

import React, { memo, useMemo, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  FileText,
  RefreshCw,
  Loader2,
  FilePlus,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useDocs } from "$/components/Tool/Docs/provider/docsProvider";
import { DocsProvider } from "$/components/Tool/Docs/provider/docsProvider";
import { useOS, useDocsFloatingOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { DocEntry } from "$/components/Tool/Docs/types";

function formatDocSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** First path segment (folder/agent) from relativePath, or "root" if at root. */
function getDocTag(relativePath: string): string {
  const segment = relativePath.split("/")[0];
  return segment && segment !== relativePath ? segment : "root";
}

const TAG_COLOR_CLASSES = [
  "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "bg-rose-500/15 text-rose-400 border-rose-500/30",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
] as const;

function getTagColorClass(tag: string): string {
  let n = 0;
  for (let i = 0; i < tag.length; i++) n = (n * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_CLASSES[n % TAG_COLOR_CLASSES.length];
}

type DocsHeaderProps = CustomProps & {
  viewMode?: "all" | "agents";
  onViewModeChange?: (mode: "all" | "agents") => void;
  agentFilesCount?: number;
  agentFilesLoading?: boolean;
  listLoading?: boolean;
  docsCount?: number;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  onNewDocClick?: () => void;
  showNewDocButton?: boolean;
};

export const DocsCustomHeader: React.FC<DocsHeaderProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
  viewMode = "all",
  onViewModeChange,
  agentFilesCount = 0,
  agentFilesLoading = false,
  listLoading = false,
  docsCount = 0,
  onRefresh,
  refreshLoading = false,
  onNewDocClick,
  showNewDocButton = false,
}) => {
  const { refreshList } = useDocs();
  const { toolAbstracts } = useOS();
  const count = viewMode === "agents" ? agentFilesCount : docsCount;
  const loading = viewMode === "agents" ? agentFilesLoading : listLoading;
  const handleRefresh = onRefresh ?? (() => refreshList());

  const docsTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "docs"),
    [toolAbstracts]
  );

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isEditMode && (
            <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}
          <div className="text-primary shrink-0">
            {docsTool?.icon || <FileText className="w-3.5 h-3.5" />}
          </div>
          <h3 className="text-xs font-normal text-foreground truncate">
            {widget.title}
          </h3>
          {!loading && count >= 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {count} {viewMode === "agents" ? "file" : "doc"}{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {showNewDocButton && onNewDocClick && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 text-xs px-2"
              onClick={onNewDocClick}
              title="New document"
            >
              <FilePlus className="w-3 h-3" />
              New doc
            </Button>
          )}
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={refreshLoading || loading}
            title="Refresh"
          >
            <RefreshCw
              className={cn("w-3 h-3", (refreshLoading || loading) && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onMaximize}
            className="h-6 w-6"
          >
            {isMaximized ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {onViewModeChange && (
        <Tabs
          value={viewMode}
          onValueChange={(v) => onViewModeChange(v as "all" | "agents")}
          className="w-full"
        >
          <TabsList className="h-7 w-full grid grid-cols-2 p-0.5 bg-muted/60">
            <TabsTrigger value="all" className="text-xs px-2 py-1 h-6 data-[state=active]:bg-background">
              All
            </TabsTrigger>
            <TabsTrigger value="agents" className="text-xs px-2 py-1 h-6 data-[state=active]:bg-background gap-1">
              <Bot className="w-3 h-3" />
              Agent files
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </div>
  );
};

function NewFileDialog({
  open,
  onOpenChange,
  onCreate,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (folderPath: string, fileName: string) => Promise<boolean>;
  loading: boolean;
}) {
  const [folderPath, setFolderPath] = useState("");
  const [fileName, setFileName] = useState("");

  const handleCreate = useCallback(async () => {
    const name = fileName.trim() || "untitled";
    const folder = folderPath.trim().replace(/\/+$/, "");
    const ok = await onCreate(folder, name);
    if (ok) {
      setFolderPath("");
      setFileName("");
      onOpenChange(false);
      window.open("/Tool/Docs", "_blank");
    }
  }, [fileName, folderPath, onCreate, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setFolderPath("");
        setFileName("");
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Create a markdown file in your OpenClaw workspace. .md will be
            added if missing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="docs-widget-folder">Folder (optional)</Label>
            <Input
              id="docs-widget-folder"
              placeholder="e.g. workspace/memory"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="docs-widget-filename">File name</Label>
            <Input
              id="docs-widget-filename"
              placeholder="my-doc"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={loading || !fileName.trim()}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DocsWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const {
    docs,
    listLoading,
    selectedPath,
    selectDoc,
    refreshList,
    createDoc,
  } = useDocs();

  const [viewMode, setViewMode] = useState<"all" | "agents">("all");
  const [agentFiles, setAgentFiles] = useState<DocEntry[]>([]);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchAgentFiles = useCallback(async () => {
    setAgentFilesLoading(true);
    try {
      const res = (await bridgeInvoke("list-openclaw-agent-files", {})) as {
        success?: boolean;
        data?: DocEntry[] | { files?: DocEntry[] };
      };
      if (!res?.success) {
        setAgentFiles([]);
        return;
      }
      const data = res.data;
      const files = Array.isArray(data) ? data : data?.files ?? [];
      setAgentFiles(files);
    } catch {
      setAgentFiles([]);
    } finally {
      setAgentFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "agents") fetchAgentFiles();
  }, [viewMode, fetchAgentFiles]);

  const handleRefresh = useCallback(() => {
    if (viewMode === "agents") {
      fetchAgentFiles();
    } else {
      refreshList();
    }
  }, [viewMode, fetchAgentFiles, refreshList]);

  const handleCreateDoc = useCallback(
    async (folderPath: string, fileName: string) => {
      const path = folderPath
        ? `${folderPath}/${fileName}`
        : fileName;
      setCreating(true);
      try {
        return await createDoc(path);
      } finally {
        setCreating(false);
      }
    },
    [createDoc]
  );

  const { openDoc } = useDocsFloatingOS();

  const handleDocClick = useCallback(
    (doc: DocEntry) => {
      selectDoc(doc.relativePath);
      openDoc(doc.relativePath);
    },
    [selectDoc, openDoc]
  );

  const sortedDocs = useMemo(() => {
    return [...docs].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [docs]);

  const sortedAgentFiles = useMemo(() => {
    return [...agentFiles].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [agentFiles]);

  const displayList = viewMode === "agents" ? sortedAgentFiles : sortedDocs;
  const isLoading = viewMode === "agents" ? agentFilesLoading : listLoading;
  const refreshLoading = viewMode === "agents" ? agentFilesLoading : listLoading;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all shadow-sm duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <DocsCustomHeader
          {...props}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          agentFilesCount={agentFiles.length}
          agentFilesLoading={agentFilesLoading}
          listLoading={listLoading}
          docsCount={docs.length}
          onRefresh={handleRefresh}
          refreshLoading={refreshLoading}
          onNewDocClick={() => setNewFileOpen(true)}
          showNewDocButton={viewMode === "all"}
        />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-2 pb-2">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {viewMode === "agents" ? "Loading agent files..." : "Loading docs..."}
              </span>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-0.5 pr-2">
                  {displayList.length > 0 && (
                    <p className="text-xs font-normal text-muted-foreground px-2 py-1 mx-1 sticky top-0 bg-card/80 backdrop-blur-sm z-[1]">
                      {viewMode === "agents" ? "Agent files" : "Recently edited"}
                    </p>
                  )}
                  {displayList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {viewMode === "agents"
                        ? "No agent files (memory.md, soul.md, etc.) in workspace."
                        : "No docs yet. Create one in OpenClaw or add from Docs."}
                    </p>
                  ) : (
                    displayList.slice(0, 20).map((doc, i) => {
                      const tag = getDocTag(doc.relativePath);
                      return (
                        <motion.button
                          key={doc.relativePath}
                          type="button"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => handleDocClick(doc)}
                          className={cn(
                            "w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left border-l-2 border-transparent transition-colors",
                            "hover:bg-muted/30 focus:outline-none",
                            selectedPath === doc.relativePath &&
                              "border-primary bg-primary/10"
                          )}
                        >
                          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <span className="text-xs font-normal text-foreground truncate">
                              {doc.name}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] text-muted-foreground">
                                {formatDocSize(doc.sizeBytes)}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[11px] px-1.5 py-0 h-4 font-normal border",
                                  getTagColorClass(tag)
                                )}
                              >
                                {tag}
                              </Badge>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </Card>

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        onCreate={handleCreateDoc}
        loading={creating}
      />
    </motion.div>
  );
});

DocsWidgetContent.displayName = "DocsWidgetContent";

const DocsWidget = memo((props: CustomProps) => {
  return (
    <DocsProvider>
      <DocsWidgetContent {...props} />
    </DocsProvider>
  );
});

DocsWidget.displayName = "DocsWidget";

export default DocsWidget;
