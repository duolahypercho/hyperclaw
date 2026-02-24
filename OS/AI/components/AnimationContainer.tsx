import React, { useEffect, useState, useRef, useMemo } from "react";
import { cn } from "$/utils";
import ReactMarkdown from "react-markdown";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { markdownComponents } from "@OS/utils/MarkdownComponents";
import { useToast } from "@/components/ui/use-toast";

interface AnimationContainerProps {
  stream?: AsyncIterable<string> | null;
  text?: string;
  isMarkdown?: boolean;
  className?: string;
  onComplete?: (completeText: string) => void;
  onContentChange?: (text: string) => void;
  autoScroll?: boolean;
  placeholder?: {
    icon?: React.ReactNode;
    text?: string;
  };
  variant?: "default" | "chat" | "minimal" | "dialog";
  // Dialog-specific props
  isDialogOpen?: boolean;
  onDialogInteraction?: () => void;
}

const TypingText: React.FC<{
  text: string;
  isMarkdown: boolean;
  variant?: "default" | "chat" | "minimal" | "dialog";
}> = ({ text, isMarkdown, variant = "default" }) => {
  if (isMarkdown) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap",
          variant === "chat" && "text-sm leading-relaxed"
        )}
      >
        <ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap">
      {text.split("").map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.15,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          {char}
        </motion.span>
      ))}
    </div>
  );
};

const StaticText: React.FC<{
  text: string;
  variant?: "default" | "chat" | "minimal" | "dialog";
}> = ({ text, variant = "default" }) => {
  return (
    <div
      className={cn(
        "whitespace-pre-wrap",
        variant === "chat" && "text-sm leading-relaxed"
      )}
    >
      {text}
    </div>
  );
};

export const AnimationContainer: React.FC<AnimationContainerProps> = ({
  stream,
  text,
  isMarkdown = false,
  className = "",
  onComplete,
  onContentChange,
  autoScroll = true,
  placeholder = {
    icon: <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />,
    text: "Content will appear here",
  },
  variant = "default",
  isDialogOpen = false,
  onDialogInteraction,
}) => {
  const [displayText, setDisplayText] = useState<string>("");
  const [animatedText, setAnimatedText] = useState<string>("");
  const [isComplete, setIsComplete] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<AsyncIterable<string> | null>(null);
  const completionCalledRef = useRef<boolean>(false);
  const { toast } = useToast();

  // Handle scroll events to detect user interaction
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !autoScroll) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 10;
      setShouldAutoScroll(isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Add typing animation effect with improved speed and emoji handling
  useEffect(() => {
    if (!displayText) {
      if (text) {
        return;
      }
      setAnimatedText("");
      return;
    }

    let currentIndex = animatedText.length;
    const textLength = displayText.length;
    const chunkSize = variant === "chat" ? 8 : 12; // Faster for chat
    let lastScrollTime = 0;
    const scrollInterval = 100;
    let animationFrameId: number;
    let lastUpdateTime = performance.now();
    const targetFrameTime = variant === "chat" ? 2 : 3; // Even faster for chat

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastUpdateTime;

      if (deltaTime >= targetFrameTime) {
        if (currentIndex < textLength) {
          const nextChunkSize = Math.min(chunkSize, textLength - currentIndex);
          setAnimatedText(displayText.slice(0, currentIndex + nextChunkSize));
          currentIndex += nextChunkSize;
          lastUpdateTime = currentTime;

          // Handle scrolling only if shouldAutoScroll is true
          if (
            shouldAutoScroll &&
            currentTime - lastScrollTime > scrollInterval &&
            autoScroll
          ) {
            requestAnimationFrame(() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            });
            lastScrollTime = currentTime;
          }
        }
      }

      if (currentIndex < textLength) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [displayText, text, shouldAutoScroll, variant]);

  // NEW: Notify parent when animated text changes
  useEffect(() => {
    if (onContentChange && animatedText) {
      onContentChange(animatedText);
    }
  }, [animatedText, onContentChange]);

  // Handle dialog interactions
  useEffect(() => {
    if (isDialogOpen && onDialogInteraction) {
      // Trigger dialog interaction when dialog is open and content changes
      if (animatedText && animatedText.length > 0) {
        onDialogInteraction();
      }
    }
  }, [isDialogOpen, animatedText, onDialogInteraction]);

  useEffect(() => {
    if (isComplete && displayText && !completionCalledRef.current) {
      completionCalledRef.current = true;
      onComplete?.(displayText);
    }
  }, [isComplete, onComplete, displayText]);

  useEffect(() => {
    if (text) {
      setIsTyping(false);
      return;
    }

    if (!stream) {
      setIsTyping(false);
      setIsComplete(true);
      streamRef.current = null;
      completionCalledRef.current = false;
      return;
    }

    // Only process the stream if it's a new stream (not already processed)
    if (streamRef.current === stream) {
      return;
    }

    streamRef.current = stream;
    completionCalledRef.current = false;

    const processStream = async () => {
      if (!stream) return;
      setDisplayText("");
      setAnimatedText("");
      setIsTyping(true);
      setIsComplete(false);

      try {
        for await (const chunk of stream) {
          setDisplayText((prev) => prev + chunk);
        }
      } catch (error) {
        console.error("Error processing stream:", error);

        let errorMessage = "Error processing stream";
        if (error instanceof Error) {
          // Extract HTTP status and message if available
          const statusMatch = error.message.match(/status: (\d+)/);
          const bodyMatch = error.message.match(/body: ({.*})/);

          if (statusMatch && bodyMatch) {
            try {
              const errorBody = JSON.parse(bodyMatch[1]);
              errorMessage = `Error: ${errorBody.message || error.message}`;
            } catch {
              errorMessage = error.message;
            }
          } else {
            errorMessage = error.message;
          }
        }

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }

      setIsTyping(false);
      setIsComplete(true);
    };

    processStream();

    // Cleanup function
    return () => {
      streamRef.current = null;
      completionCalledRef.current = false;
    };
  }, [stream, toast]);

  const TextContent = useMemo(() => {
    if (animatedText || isTyping) {
      // If we have animated text, show it as static text (no character animation)
      if (animatedText) {
        return <StaticText text={animatedText} variant={variant} />;
      }

      // If we're typing but have no text yet, show a loading indicator
      if (isTyping) {
        return (
          <div className="flex h-full items-center gap-2 text-muted-foreground">
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        );
      }
    }

    if (text) {
      return <StaticText text={text} variant={variant} />;
    }

    // Only show placeholder for default variant
    if (variant === "default") {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-center py-8 text-muted-foreground"
        >
          {placeholder.icon}
          <p>{placeholder.text}</p>
        </motion.div>
      );
    }

    return null;
  }, [animatedText, isTyping, isMarkdown, text, placeholder, variant]);

  // Determine variant based on className if not explicitly set
  const effectiveVariant = useMemo(() => {
    if (variant !== "default") return variant;

    if (
      className.includes("bg-transparent") &&
      className.includes("border-none")
    ) {
      return "chat";
    }

    return "default";
  }, [variant, className]);

  const containerStyles = useMemo(() => {
    switch (effectiveVariant) {
      case "chat":
        return "relative font-mono text-sm min-h-[20px] w-full h-full overflow-visible";
      case "minimal":
        return "relative text-sm min-h-[20px] w-full h-full overflow-visible";
      case "dialog":
        return "relative text-sm min-h-[40px] w-full h-full overflow-visible bg-transparent border-none shadow-none";
      default:
        return "relative font-mono text-sm customScrollbar2 resize-none min-h-[80px] w-full h-full rounded-md border border-solid border-primary/10 bg-secondary/30 px-3 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] max-h-[200px] overflow-y-auto scroll-smooth overflow-x-hidden";
    }
  }, [effectiveVariant]);

  return (
    <div ref={containerRef} className={cn(containerStyles, className)}>
      <AnimatePresence mode="wait">{TextContent}</AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
};

export default AnimationContainer;
