"use client";

import React, { useState } from "react";
import StatusWidget from "$/components/Home/widgets/StatusWidget";
import AgentChatWidget from "$/components/Home/widgets/AgentChatWidget";
import type { Widget } from "$/components/Home/Dashboard";
import type { CustomProps } from "$/components/Home/widgets/types/widgets";
import { MessageSquare, Activity } from "lucide-react";

// Stub widget objects — widgets only read widget.title and widget.config from these.
const STATUS_WIDGET: Widget = {
  id: "chat-page-status",
  type: "agent-status",
  title: "Agents",
  icon: <Activity className="w-4 h-4" />,
  component: StatusWidget as React.ComponentType<CustomProps>,
  defaultValue: { w: 8, h: 10, minW: 4, minH: 6, x: 0, y: 0 },
};

const AGENT_CHAT_WIDGET: Widget = {
  id: "chat-page-agent-chat",
  type: "agent-chat",
  title: "Chat",
  icon: <MessageSquare className="w-4 h-4" />,
  component: AgentChatWidget as React.ComponentType<CustomProps>,
  defaultValue: { w: 16, h: 10, minW: 8, minH: 6, x: 8, y: 0 },
  config: {},
};

const Chat = () => {
  const [leftMaximized, setLeftMaximized] = useState(false);
  const [rightMaximized, setRightMaximized] = useState(false);

  const showLeft = !rightMaximized;
  const showRight = !leftMaximized;

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-background">
      {/* Left panel — agent list / status */}
      {showLeft && (
        <div
          className={
            leftMaximized
              ? "w-full h-full"
              : "w-[340px] shrink-0 h-full border-r border-border border-solid border-t-0 border-b-0 border-l-0"
          }
        >
          <StatusWidget
            widget={STATUS_WIDGET}
            className="rounded-none border-none shadow-none"
            isMaximized={leftMaximized}
            onMaximize={() => setLeftMaximized((v) => !v)}
            isEditMode={false}
          />
        </div>
      )}

      {/* Right panel — agent chat */}
      {showRight && (
        <div className="flex-1 h-full min-w-0">
          <AgentChatWidget
            widget={AGENT_CHAT_WIDGET}
            className="rounded-none border-none shadow-none"
            isMaximized={rightMaximized}
            onMaximize={() => setRightMaximized((v) => !v)}
            isEditMode={false}
          />
        </div>
      )}
    </div>
  );
};

export default Chat;
