"use client";

import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import { rehypePlugins } from "@OS/AI/components/rehypeConfig";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot } from "lucide-react";
import { getMediaUrl } from "$/utils";
import { AnimatedThinkingText } from "@OS/AI/components/Chat";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import { JsonViewer } from "./JsonViewer";
import { SystemEventsGroup } from "./SystemEvents";

export function shouldShowAvatarLocal(messages: GatewayChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prevMsg = messages[index - 1];
  const currMsg = messages[index];
  if (!prevMsg || !currMsg) return true;
  // Group assistant, toolResult, and tool_result as the same "side"
  // so consecutive tool calls / results don't each show an avatar.
  const side = (role: string) => (role === "user" ? "user" : "assistant");
  return side(prevMsg.role) !== side(currMsg.role);
}

export function shouldShowMessageActionsLocal(message: GatewayChatMessage, isLoading: boolean): boolean {
  if (isLoading) return false;
  return message.role === "assistant" && !!message.content?.trim();
}

export const MemoizedReactMarkdown: React.FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components
);

export const memoizedMarkdownComponents = {
  user: createMarkdownComponents(true),
  assistant: createMarkdownComponents(false),
};

function AttachmentItem({ attachment }: { attachment: { id: string; type: string; mimeType: string; name: string; dataUrl?: string } }) {
  if (attachment.mimeType.startsWith("image/")) {
    if (!attachment.dataUrl) {
      return <span className="text-xs text-muted-foreground">{attachment.name}</span>;
    }
    return (
      <a href={attachment.dataUrl} download={attachment.name} title={attachment.name}>
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="max-w-[200px] max-h-[150px] rounded-md object-contain border border-border/30 hover:opacity-80 transition-opacity"
        />
      </a>
    );
  }

  if (attachment.mimeType.startsWith("video/")) {
    if (!attachment.dataUrl) {
      return <span className="text-xs text-muted-foreground">{attachment.name}</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        <video
          src={attachment.dataUrl}
          controls
          className="max-w-[280px] max-h-[180px] rounded-md border border-border/30"
        />
        <a
          href={attachment.dataUrl}
          download={attachment.name}
          className="text-[10px] text-muted-foreground hover:text-foreground truncate max-w-[280px]"
        >
          {attachment.name}
        </a>
      </div>
    );
  }

  // Generic file — show icon + name. No dataUrl means the file lives on the
  // connector machine; we display metadata only (no in-browser download).
  const fileIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-muted-foreground">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  );
  if (!attachment.dataUrl) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/50 bg-muted/30 text-xs max-w-[220px]">
        {fileIcon}
        <span className="truncate text-foreground/80">{attachment.name}</span>
      </div>
    );
  }
  return (
    <a
      href={attachment.dataUrl}
      download={attachment.name}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors text-xs max-w-[220px]"
      title={`Download ${attachment.name}`}
    >
      {fileIcon}
      <span className="truncate text-foreground/80">{attachment.name}</span>
    </a>
  );
}

export const EnhancedMessageBubble = memo(
  ({
    message,
    isUser,
    showAvatar = true,
    onCopy,
    onReply,
    isLoading = false,
    isLastAssistantMessage = false,
    botPic,
    userPic,
    assistantAvatar,
  }: {
    message: GatewayChatMessage;
    isUser: boolean;
    showAvatar?: boolean;
    onCopy?: (message: GatewayChatMessage) => void;
    onReply?: (message: GatewayChatMessage) => void;
    isLoading?: boolean;
    isLastAssistantMessage?: boolean;
    botPic?: string;
    userPic?: { src?: string; fallback: string; alt?: string };
    assistantAvatar?: { src?: string; fallback: string; alt?: string };
  }) => {
    const defaultIcon = isUser ? (
      <span className="text-xs">U</span>
    ) : (
      assistantAvatar?.fallback
        ? <span className="text-xs">{assistantAvatar.fallback}</span>
        : <Bot className="w-4 h-4" />
    );

    if (message.role === "system" || message.role === "tool") {
      return null;
    }

    const rawContent = message.content || "";

    // Separate system notification lines and strip timestamp prefixes from user text
    let content = rawContent;
    const systemEvents: Array<{ name: string; isError: boolean; detail: string }> = [];
    if (isUser) {
      const lines = rawContent.split("\n");
      const userLines: string[] = [];
      for (const line of lines) {
        const sysMatch = line.trim().match(/^System:\s*\[.*?\]\s*Exec\s+(completed|failed)\s*\([^)]*\).*?::\s*(.*)/i);
        if (sysMatch) {
          const isError = sysMatch[1].toLowerCase() === "failed";
          const detail = sysMatch[2].trim();
          systemEvents.push({ name: isError ? "Exec failed" : "Exec completed", isError, detail });
        } else if (/^\s*System:\s*\[/.test(line)) {
          // Generic system line
          systemEvents.push({ name: "system", isError: false, detail: line.trim() });
        } else {
          // Strip timestamp prefix like [Mon 2026-03-09 21:31 EDT]
          const stripped = line.replace(/^\s*\[\w{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]\s*/, "");
          userLines.push(stripped);
        }
      }
      content = userLines.join("\n").trim();
    }
    const hasTextContent = content.trim();
    const hasAttachments = message.attachments && message.attachments.length > 0;
    const contentBlocks = message.contentBlocks;
    const hasRenderableBlocks = Array.isArray(contentBlocks) && contentBlocks.some((block) =>
      (block?.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) ||
      (block?.type === "text" && typeof block.text === "string" && block.text.trim()) ||
      block?.type === "toolResult"
    );

    // If no real content, hide the message entirely
    if (!hasTextContent && !hasAttachments && !systemEvents.length && !hasRenderableBlocks && !isLoading) {
      return null;
    }

    const renderContent = () => {
      // Show loading/thinking state
      if (isLoading && !message.content?.trim()) {
        return (
          <div className="flex items-center">
            <AnimatedThinkingText />
          </div>
        );
      }

      // If we have content blocks, render them
      if (contentBlocks && contentBlocks.length > 0) {
        return (
          <div className="space-y-2">
            {contentBlocks.map((block: any, index: number) => {
              // Render thinking block (matching ThinkingToolRenderer style)
              if (block.type === "thinking" && block.thinking) {
                return (
                  <div
                    key={`thinking-${index}`}
                    className="relative w-full transition-all duration-300 select-text rounded-lg border border-border/50 text-muted-foreground hover:text-foreground/80"
                    style={{
                      borderTopRightRadius: "10px",
                      borderBottomRightRadius: "10px",
                      borderTopLeftRadius: "0px",
                      borderBottomLeftRadius: "10px",
                    }}
                  >
                    <Accordion type="single" collapsible defaultValue="">
                      <AccordionItem value="thoughts" className="border-0">
                        <AccordionTrigger className="flex items-center gap-2 justify-start py-0 px-0 text-xs font-medium hover:no-underline [&>svg]:h-3 [&>svg]:w-3 [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                          <span className="text-muted-foreground hover:text-foreground/80">
                            Thoughts
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0 pt-0">
                          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <div className="text-[11px] text-foreground/80 leading-relaxed prose prose-xs dark:prose-invert max-w-none [&_p]:text-[11px] [&_li]:text-[11px] [&_code]:text-[10px] [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-[11px]">
                              <MemoizedReactMarkdown
                                components={memoizedMarkdownComponents.assistant}
                                remarkPlugins={[
                                  remarkGfm,
                                  remarkBreaks,
                                  [remarkMath, { singleDollarTextMath: false }],
                                ]}
                                rehypePlugins={rehypePlugins}
                              >
                                {block.thinking}
                              </MemoizedReactMarkdown>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                );
              }

              // Render tool result block (only if not merged into toolCall)
              if (block.type === "toolResult") {
                return (
                  <div key={`toolresult-${index}`} className={cn(
                    "p-2 rounded-md text-xs font-mono overflow-hidden max-w-full",
                    block.isError ? "bg-red-500/10 text-red-500" : "text-muted-foreground"
                  )}>
                    <div className="flex items-center gap-1 mb-1 text-[10px] uppercase opacity-70">
                      <span>Result:</span>
                      <span className="font-semibold">{block.toolName}</span>
                    </div>
                    <JsonViewer content={block.content} />
                  </div>
                );
              }

              // Render text block
              if (block.type === "text" && block.text) {
                // Strip system lines and timestamp prefixes from text blocks
                let blockText = block.text;
                if (isUser) {
                  blockText = blockText
                    .split("\n")
                    .filter((l: string) => !/^\s*System:\s*\[/.test(l))
                    .map((l: string) => l.replace(/^\s*\[\w{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]\s*/, ""))
                    .join("\n")
                    .trim();
                  if (!blockText) return null;
                }
                // Strip model protocol markers (e.g. <final>, <thinking>, </final>)
                // then escape remaining HTML-like tags so Markdown doesn't interpret them
                const processedContent = blockText
                  .replace(/<\/?\s*(?:final|thinking|NO_REPLY)\s*\/?>/gi, "")
                  .replace(/<(\w+)>/g, "@$1")
                  .trim();
                return (
                  <MemoizedReactMarkdown
                    key={`text-${index}`}
                    components={
                      isUser
                        ? memoizedMarkdownComponents.user
                        : memoizedMarkdownComponents.assistant
                    }
                    remarkPlugins={
                      isUser
                        ? [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]
                        : [remarkGfm, [remarkMath, { singleDollarTextMath: false }]]
                    }
                    rehypePlugins={rehypePlugins}
                  >
                    {processedContent}
                  </MemoizedReactMarkdown>
                );
              }

              return null;
            })}
          </div>
        );
      }

      // Fallback to simple content rendering
      // Strip model protocol markers, then escape remaining HTML-like tags
      const processedContent = content
        .replace(/<\/?\s*(?:final|thinking|NO_REPLY)\s*\/?>/gi, "")
        .replace(/<(\w+)>/g, "@$1")
        .trim();

      return (
        <MemoizedReactMarkdown
          components={
            isUser
              ? memoizedMarkdownComponents.user
              : memoizedMarkdownComponents.assistant
          }
          remarkPlugins={
            isUser
              ? [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]
              : [remarkGfm, [remarkMath, { singleDollarTextMath: false }]]
          }
          rehypePlugins={rehypePlugins}
        >
          {processedContent}
        </MemoizedReactMarkdown>
      );
    };

    const hasSystemEvents = systemEvents.length > 0;
    const failedCount = systemEvents.filter(e => e.isError).length;
    const completedCount = systemEvents.length - failedCount;

    return (
      <>
        {/* System events group — matching assistant-side GroupedToolActions style */}
        {hasSystemEvents && (
          <SystemEventsGroup events={systemEvents} completedCount={completedCount} failedCount={failedCount} />
        )}

        {/* User message bubble — only render if there's actual content */}
        {(hasTextContent || hasAttachments || hasRenderableBlocks || isLoading) && (
          <div
            className={cn(
              "flex gap-3 group",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {!isUser && (
              <div className="w-8 h-8 flex-shrink-0">
                {showAvatar ? (
                  <Avatar className="w-8 h-8">
                    {botPic ? (
                      <AvatarImage src={botPic.startsWith("http") || botPic.startsWith("data:") ? botPic : getMediaUrl(botPic)} />
                    ) : assistantAvatar?.src ? (
                      <AvatarImage src={assistantAvatar.src} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {defaultIcon}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-8 h-8 flex-shrink-0" />
                )}
              </div>
            )}

            <div
              className={cn(
                "relative flex flex-col max-w-full min-w-0",
                isUser ? "justify-end items-end" : "justify-start items-start"
              )}
            >
              <div
                className={cn(
                  "py-1.5 px-3 relative w-full max-w-full overflow-hidden transition-all duration-200 group select-text font-normal text-sm",
                  isUser
                    ? "bg-secondary text-secondary-foreground border-solid border-border border-1"
                    : "border border-border/50"
                )}
                style={{
                  borderTopRightRadius: isUser ? "0px" : "10px",
                  borderBottomRightRadius: isUser ? "10px" : "10px",
                  borderTopLeftRadius: isUser ? "10px" : "0px",
                  borderBottomLeftRadius: isUser ? "10px" : "10px",
                }}
              >
                {/* User attachments — shown above text */}
                {hasAttachments && isUser && (
                  <div className="flex flex-wrap gap-2 mb-1">
                    {message.attachments!.map((att) => (
                      <AttachmentItem key={att.id} attachment={att} />
                    ))}
                  </div>
                )}
                {renderContent()}
                {/* Assistant attachments — shown below text */}
                {hasAttachments && !isUser && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.attachments!.map((att) => (
                      <AttachmentItem key={att.id} attachment={att} />
                    ))}
                  </div>
                )}
              </div>

              {/* Copy button — only on the last assistant message before each user turn, and the final assistant message */}
              {isLastAssistantMessage && !isUser && !isLoading && message.content?.trim() && (
                <div className={cn("flex items-center gap-1 mt-1 ml-3")}>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => onCopy?.(message)}
                    className="h-6 w-6"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </Button>
                </div>
              )}
            </div>

            {isUser && (
              <div className="w-8 h-8 flex-shrink-0">
                {showAvatar ? (
                  <Avatar className="w-8 h-8">
                    {userPic?.src && (
                      <AvatarImage src={userPic.src} alt={userPic.alt} />
                    )}
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                      {defaultIcon}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-8 h-8 flex-shrink-0" />
                )}
              </div>
            )}
          </div>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.contentBlocks === nextProps.message.contentBlocks &&
      prevProps.message.role === nextProps.message.role &&
      prevProps.message.attachments === nextProps.message.attachments &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isLastAssistantMessage === nextProps.isLastAssistantMessage &&
      prevProps.showAvatar === nextProps.showAvatar &&
      prevProps.botPic === nextProps.botPic &&
      prevProps.userPic?.src === nextProps.userPic?.src &&
      prevProps.userPic?.fallback === nextProps.userPic?.fallback &&
      prevProps.assistantAvatar?.src === nextProps.assistantAvatar?.src &&
      prevProps.assistantAvatar?.fallback === nextProps.assistantAvatar?.fallback
    );
  }
);

EnhancedMessageBubble.displayName = "EnhancedMessageBubble";
