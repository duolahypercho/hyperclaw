"use client";

import React, { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
  Loader2,
  Building2,
  Briefcase,
  Coffee,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PixelOfficeProvider, usePixelOffice } from "$/components/PixelOffice";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import type { AgentStatus } from "$/components/PixelOffice/types";

export const PixelOfficeCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { agents, loading, refresh } = usePixelOffice();
  const { toolAbstracts } = useOS();

  const pixelOfficeTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "pixel-office"),
    [toolAbstracts]
  );

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary">
          {pixelOfficeTool?.icon || <Building2 className="w-3.5 h-3.5" />}
        </div>
        <h3 className="text-xs font-normal text-foreground truncate">
          {widget.title}
        </h3>
        {!loading && agents.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => refresh()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw
            className={cn("w-3 h-3", loading && "animate-spin")}
          />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => window.open("/Tool/PixelOffice", "_blank")}
          title="Open full office"
        >
          <ExternalLink className="w-3 h-3" />
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
  );
};

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 w-1.5 h-1.5 rounded-full",
        status === "working"
          ? "bg-emerald-500"
          : "bg-muted-foreground"
      )}
      title={status === "working" ? "Working" : "Idle"}
      aria-hidden
    />
  );
}

const PixelOfficeWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { agents, statuses, currentTasks, loading, error, refresh } = usePixelOffice();

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
        <PixelOfficeCustomHeader {...props} />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-2 pb-2">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 px-3">
              <p className="text-sm text-destructive font-mono text-center">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-sm"
                onClick={() => refresh()}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("w-3 h-3 mr-1", loading && "animate-spin")}
                />
                Retry
              </Button>
            </div>
          ) : loading && agents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading team from OpenClaw...
              </span>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 px-3">
              <Building2 className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground text-center">
                No agents in office yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-sm gap-1.5"
                onClick={() => window.open("/Tool/PixelOffice", "_blank")}
              >
                <ExternalLink className="w-3 h-3" />
                Open AI Agent Office
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0">
                <ul className="space-y-1 pr-2 py-1">
                  {agents.map((agent, i) => {
                    const status = statuses[agent.id] ?? "idle";
                    const currentTask = currentTasks[agent.id];
                    return (
                      <motion.li
                        key={agent.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md border-l-2 border-transparent",
                          "hover:bg-muted/30 transition-colors",
                          status === "working" && "border-primary/50 bg-primary/5"
                        )}
                      >
                        <StatusDot status={status} />
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {agent.name}
                            {agent.isBoss && (
                              <span className="text-muted-foreground ml-1 text-[10px]">
                                (lead)
                              </span>
                            )}
                          </span>
                          {currentTask && (
                            <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              {status === "working" ? (
                                <Briefcase className="w-2.5 h-2.5 shrink-0" />
                              ) : (
                                <Coffee className="w-2.5 h-2.5 shrink-0" />
                              )}
                              {currentTask}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] shrink-0 px-1.5 py-0.5 rounded font-medium border",
                            status === "working"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-muted/80 text-muted-foreground border-border"
                          )}
                        >
                          {status === "working" ? "Working" : "Idle"}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              </ScrollArea>
              <div className="pt-1.5 border-t border-border/50 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => window.open("/Tool/PixelOffice", "_blank")}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open full office
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

PixelOfficeWidgetContent.displayName = "PixelOfficeWidgetContent";

const PixelOfficeWidget = memo((props: CustomProps) => {
  return (
    <PixelOfficeProvider>
      <PixelOfficeWidgetContent {...props} />
    </PixelOfficeProvider>
  );
});

PixelOfficeWidget.displayName = "PixelOfficeWidget";

export default PixelOfficeWidget;
