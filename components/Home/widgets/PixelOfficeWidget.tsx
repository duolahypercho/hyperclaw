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
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PixelOfficeProvider, usePixelOffice, FullOfficeView } from "$/components/PixelOffice";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";

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
    <div className={cn("flex items-center justify-between px-3 py-2 transition-opacity duration-200", !isEditMode && "absolute top-0 left-0 right-0 z-10 bg-card/90 backdrop-blur-sm rounded-t-md opacity-0 group-hover:opacity-100")}>
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
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" />
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

const PixelOfficeWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { agents, loading, error, refresh } = usePixelOffice();

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
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <PixelOfficeCustomHeader {...props} />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
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
              <div className="relative">
                <Building2 className="w-8 h-8 text-muted-foreground/50" />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-sm bg-primary/40 border border-primary/60"
                  aria-hidden
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                No agents in office yet.
              </p>
              <p className="text-[11px] text-muted-foreground/80 text-center max-w-[200px]">
                Open the full pixel office to see your AI team.
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
            <div className="flex-1 min-h-0 w-full flex flex-col rounded-b-md overflow-hidden bg-black-100 relative">
              {/* Same FullOfficeView as Tool/PixelOffice; layout is shared via officeStateSingleton so edits on the full page appear here and vice versa. */}
              <FullOfficeView embedMode />
              <div className="absolute bottom-2 right-2 z-[60]">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 text-[10px] opacity-90 shadow-md"
                  onClick={() => window.open("/Tool/PixelOffice", "_blank")}
                >
                  <ExternalLink className="w-2.5 h-2.5 mr-1" />
                  Full office
                </Button>
              </div>
            </div>
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
