import { useRef, useState } from "react";
import { cn } from "$/utils";
import { CopilotTextarea } from "$/components/Tool/AITextArea";
import { HTMLCopanionTextAreaElement } from "$/components/Tool/AITextArea/types";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { FormattedMessage } from "$/types";
import { MakeSystemPrompt } from "$/components/Tool/AITextArea/types/autosuggestions-config";

export interface AITextareaProps {
  value?: string;
  onValueChange?: (value: string) => void;
  textareaPurpose?: string;
  fewShotMessages?: FormattedMessage[];
  makeSystemPrompt?: MakeSystemPrompt;
  className?: string;
  placeholder?: string;
}

const AITextarea = (props: AITextareaProps) => {
  const [generating, setGenerating] = useState(false);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);

  return (
    <div
      className={cn(
        "relative flex flex-col bg-transparent border border-primary/10 border-solid outline-none text-foreground font-medium placeholder-[#9ba1ae] w-full resize-none min-h-[20px] leading-[20px] text-sm customScrollbar2 px-3 py-2 rounded-md hover:border-primary/20 transition-colors duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] focus-within:ring-[1px] focus-within:ring-offset-ring-input-ring-focus focus-within:ring-offset-1",
        props.className
      )}
    >
      <CopilotTextarea
        ref={textareaRef}
        className="flex-1 border-0 text-foreground font-medium"
        placeholder={props.placeholder}
        value={props.value}
        onValueChange={props.onValueChange}
        autosuggestionsConfig={{
          textareaPurpose: props.textareaPurpose || "To enhance the text",
          disabledAutosuggestionsWhenTyping: true,
          chatApiConfigs: {
            suggestionsApiConfig: {
              maxTokens: 50,
              stop: ["\n", ".", "?"],
            },
            enhanceTextApiConfig: {
              makeSystemPrompt: props.makeSystemPrompt,
              fewShotMessages: props.fewShotMessages,
            },
          },
        }}
        suggestionsStyle={{
          fontStyle: "normal",
          color: "#9ba1ae",
        }}
        hoverMenuClassname="p-2 absolute z-10 top-[-10000px] left-[-10000px] mt-[-6px] opacity-0 transition-opacity duration-700"
        setgenerating={setGenerating}
        showSkeleton={false}
      />
      <Button
        variant="outline"
        size="sm"
        className="ml-auto flex items-center gap-1 max-w-[120px]"
        onClick={() => textareaRef.current?.enhance({})}
        disabled={generating}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-xs">
          {generating ? "Enhancing..." : "Enhance"}
        </span>
      </Button>
    </div>
  );
};

export { AITextarea };
