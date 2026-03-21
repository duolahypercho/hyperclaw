"use client";

import React, { useState, useCallback } from "react";
import GatewayChatWidget from "$/components/Home/widgets/GatewayChatWidget";
import type { Widget } from "$/components/Home/Dashboard";

const STORAGE_KEY = "tool-chat-config";

const Chat = () => {
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const handleConfigChange = useCallback(
    (newConfig: Record<string, unknown>) => {
      setConfig(newConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      } catch {}
    },
    []
  );

  const mockWidget = {
    id: "tool-chat",
    type: "gateway-chat",
    title: "Chat",
    icon: null,
    component: GatewayChatWidget,
    defaultValue: { w: 12, h: 12, minW: 4, minH: 4, x: 0, y: 0 },
    isResizable: false,
    config,
  } as unknown as Widget;

  return (
    <div className="h-full w-full">
      <GatewayChatWidget
        widget={mockWidget}
        isEditMode={false}
        isMaximized={true}
        onMaximize={() => {}}
        onConfigChange={handleConfigChange}
      />
    </div>
  );
};

export default Chat;
