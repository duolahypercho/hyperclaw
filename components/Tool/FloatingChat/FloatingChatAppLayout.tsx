import React, { memo, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { X, MessageSquare } from "lucide-react";
import AppLayout from "$/layouts/AppLayout";
import { FloatingChatViewer } from "./FloatingChatViewer";
import { useFloatingChatOS } from "@OS/Provider/OSProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { cn } from "@/lib/utils";

const FloatingChatAppLayout = memo(() => {
  const { instances, closeChat } = useFloatingChatOS();
  const { agents } = useHyperclawContext();
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [unreadTabs, setUnreadTabs] = useState<Set<string>>(new Set());
  const prevInstanceIdsRef = useRef<Set<string>>(new Set());

  // Auto-select new tabs, fallback on close — only depends on instances (not activeTabId)
  useEffect(() => {
    const currentIds = new Set(instances.keys());
    const prevIds = prevInstanceIdsRef.current;

    // Find newly added instance
    const newId = [...currentIds].find((id) => !prevIds.has(id));
    if (newId) {
      setActiveTabId(newId);
      setUnreadTabs((prev) => {
        const next = new Set(prev);
        next.delete(newId);
        return next;
      });
    } else {
      // If active tab was removed, fallback to last remaining
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

  const handleTabClick = useCallback((id: string) => {
    setActiveTabId(id);
    setUnreadTabs((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Use ref so the callback never changes identity — avoids re-rendering all viewers on tab switch
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const handleNewMessage = useCallback(
    (instanceId: string) => {
      if (instanceId !== activeTabIdRef.current) {
        setUnreadTabs((prev) => {
          if (prev.has(instanceId)) return prev;
          return new Set(prev).add(instanceId);
        });
      }
    },
    [] // stable — reads activeTabId from ref
  );

  const getTabLabel = useCallback(
    (inst: { agentId: string; taskContext: { title: string } | null }) => {
      if (inst.taskContext?.title) {
        const title = inst.taskContext.title;
        return title.length > 20 ? title.slice(0, 18) + "…" : title;
      }
      const agent = agents.find((a) => a.id === inst.agentId);
      return agent?.name || inst.agentId.slice(0, 8);
    },
    [agents]
  );

  const hasTask = useMemo(() => {
    if (!activeTabId) return false;
    const active = instances.get(activeTabId);
    return !!active?.taskContext;
  }, [activeTabId, instances]);

  const initialSize = useMemo(
    () => ({
      min: { width: hasTask ? 625 : 625, height: 400 },
      default: { width: hasTask ? 700 : 420, height: 520 },
    }),
    [hasTask]
  );

  const instancesArray = useMemo(() => Array.from(instances.values()), [instances]);
  const showTabs = instancesArray.length > 1;

  // Stable per-instance callbacks so viewers don't re-render on tab switch
  const newMessageCallbacks = useRef(new Map<string, () => void>());
  const getNewMessageCb = useCallback(
    (id: string) => {
      let cb = newMessageCallbacks.current.get(id);
      if (!cb) {
        cb = () => handleNewMessage(id);
        newMessageCallbacks.current.set(id, cb);
      }
      return cb;
    },
    [handleNewMessage]
  );
  // Clean up removed instances
  useEffect(() => {
    const ids = new Set(instances.keys());
    for (const key of newMessageCallbacks.current.keys()) {
      if (!ids.has(key)) newMessageCallbacks.current.delete(key);
    }
  }, [instances]);

  return (
    <AppLayout
      showState={instances.size > 0}
      uniqueKey="floating-chat-container"
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
              const isUnread = unreadTabs.has(inst.id);
              return (
                <button
                  key={inst.id}
                  onClick={() => handleTabClick(inst.id)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded-t transition-colors max-w-[160px] shrink-0 group",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
                  )}
                >
                  <MessageSquare className="w-3 h-3 shrink-0" />
                  <span className="truncate">{getTabLabel(inst)}</span>
                  {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  )}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      closeChat(inst.id);
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

        {/* Content — all instances stay mounted (CSS hidden) to preserve WebSocket connections */}
        <div className="relative flex-1 min-h-0">
          {instancesArray.map((inst) => (
            <div
              key={inst.id}
              className={cn(
                "absolute inset-0",
                inst.id === activeTabId ? "visible z-10" : "invisible z-0"
              )}
            >
              <FloatingChatViewer
                agentId={inst.agentId}
                sessionKey={inst.sessionKey}
                taskContext={inst.taskContext}
                onClose={() => closeChat(inst.id)}
                onNewMessage={getNewMessageCb(inst.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
});

FloatingChatAppLayout.displayName = "FloatingChatAppLayout";

export default FloatingChatAppLayout;
