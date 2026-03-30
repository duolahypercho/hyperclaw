"use client";

import React, { memo, useRef, useEffect } from "react";
import ToolLayout from "$/layouts/ToolLayout";
import { useDoctorTerminal, TerminalLine } from "./DoctorTerminalContext";
import { cn } from "@/lib/utils";
import { Terminal, Loader2 } from "lucide-react";

const LineEntry: React.FC<{ line: TerminalLine }> = memo(({ line }) => (
  <div
    className={cn(
      "font-mono text-xs leading-5 whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-1 duration-150",
      line.type === "info" && "text-muted-foreground",
      line.type === "step" && "text-primary",
      line.type === "success" && "text-emerald-500",
      line.type === "error" && "text-destructive",
    )}
  >
    {line.type === "step" && <span className="text-muted-foreground/60 mr-1.5">{"›"}</span>}
    {line.type === "success" && <span className="mr-1.5">{"✓"}</span>}
    {line.type === "error" && <span className="mr-1.5">{"✗"}</span>}
    {line.text}
  </div>
));
LineEntry.displayName = "LineEntry";

const DoctorTerminalPanel = memo(() => {
  const { isOpen, lines, isRunning, close } = useDoctorTerminal();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
  const isDone = !isRunning && lines.length > 0;

  return (
    <ToolLayout
      showState={isOpen}
      uniqueKey="doctor-terminal"
      title="OpenClaw Doctor"
      icon={<Terminal className="w-3.5 h-3.5" />}
      onClose={close}
      closeDisabled={isRunning}
      initialWidth={520}
      initialHeight={340}
      minWidth={380}
      minHeight={200}
      status={
        <>
          {isRunning && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">running</span>
            </span>
          )}
          {isDone && (
            <span className={cn(
              "text-xs shrink-0",
              lastLine?.type === "error" ? "text-destructive" : "text-emerald-500",
            )}>
              {lastLine?.type === "error" ? "failed" : "done"}
            </span>
          )}
        </>
      }
    >
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden p-3 customScrollbar2"
      >
        {lines.map((line, i) => (
          <LineEntry key={i} line={line} />
        ))}
        {isRunning && (
          <div className="font-mono text-xs text-muted-foreground/40 mt-1 animate-pulse">▌</div>
        )}
        {!isRunning && lines.length === 0 && (
          <div className="font-mono text-xs text-muted-foreground/40">
            Ready to run openclaw doctor --fix
          </div>
        )}
      </div>
    </ToolLayout>
  );
});

DoctorTerminalPanel.displayName = "DoctorTerminalPanel";

export default DoctorTerminalPanel;
