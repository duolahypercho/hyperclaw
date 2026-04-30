import React, { memo, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { X, FileText } from "lucide-react";
import AppLayout from "$/layouts/AppLayout";
import { FloatingDocViewer } from "./FloatingDocViewer";
import { useDocsFloatingOS } from "@OS/Provider/OSProv";
import { cn } from "@/lib/utils";

const DocsAppLayout = memo(() => {
  const { instances, closeDoc } = useDocsFloatingOS();
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const prevInstanceIdsRef = useRef<Set<string>>(new Set());

  // Auto-select new tabs, fallback on close — only depends on instances
  useEffect(() => {
    const currentIds = new Set(instances.keys());
    const prevIds = prevInstanceIdsRef.current;

    // Find newly added instance
    const newId = [...currentIds].find((id) => !prevIds.has(id));
    if (newId) {
      setActiveTabId(newId);
    } else {
      setActiveTabId((prev) => {
        if (prev && !currentIds.has(prev)) {
          const remaining = [...currentIds];
          return remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
        return prev;
      });
    }

    prevInstanceIdsRef.current = currentIds;
  }, [instances]);

  const initialSize = useMemo(
    () => ({
      min: { width: 320, height: 200 },
      default: { width: 480, height: 320 },
    }),
    []
  );

  const instancesArray = useMemo(() => Array.from(instances.values()), [instances]);
  const showTabs = instancesArray.length > 1;
  const activeInstance = activeTabId ? instances.get(activeTabId) : null;

  const getFilename = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  };

  return (
    <AppLayout
      showState={instances.size > 0}
      uniqueKey="floating-doc-container"
      className="p-0 flex flex-col overflow-hidden"
      variant="default"
      initialSize={initialSize}
    >
      <div className="h-full flex flex-col min-h-0">
        {/* Tab bar */}
        {showTabs && (
          <div className="flex items-center gap-0.5 px-2 pt-1 pb-0.5 overflow-x-auto shrink-0 border-b border-primary/10">
            {instancesArray.map((inst) => {
              const isActive = inst.id === activeTabId;
              return (
                <button
                  key={inst.id}
                  onClick={() => setActiveTabId(inst.id)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded-t transition-colors max-w-[160px] shrink-0 group",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
                  )}
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{getFilename(inst.path)}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDoc(inst.id);
                    }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content — only active doc rendered (others unmount — cheap to reload) */}
        {activeInstance && (
          <div className="flex-1 min-h-0">
            <FloatingDocViewer
              path={activeInstance.path}
              onClose={() => closeDoc(activeInstance.id)}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
});

DocsAppLayout.displayName = "DocsAppLayout";

export default DocsAppLayout;
