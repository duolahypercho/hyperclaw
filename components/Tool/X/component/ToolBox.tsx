import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import {
  Sparkles,
  ListPlus,
  Smile,
  TrendingUp,
  MessageSquare,
  CheckCircle,
  Hash,
  Scissors,
  Lightbulb,
  Loader2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import promptData from "../lib/prompt.json";

const actions = [
  {
    label: "Enhance tweet",
    icon: Sparkles,
    onClick: undefined,
    tooltip: "Enhance the tweet with AI",
    group: "ai",
  },
  {
    label: "Add Emoji",
    icon: Smile,
    onClick: undefined,
    tooltip: "Apply an emoji to the tweet",
    group: "ai",
  },
  {
    label: "Tone",
    icon: MessageSquare,
    onClick: undefined,
    tooltip: "Apply a tone to the tweet",
    group: "ai",
    isPopover: true,
  },
  {
    label: "Grammar",
    icon: CheckCircle,
    onClick: undefined,
    tooltip: "Check the grammar of the tweet",
    group: "ai",
  },
  {
    label: "Add Hashtag",
    icon: Hash,
    onClick: undefined,
    tooltip: "Apply a hashtag to the tweet",
    group: "ai",
  },
  {
    label: "Shorten it",
    icon: Scissors,
    onClick: undefined,
    tooltip: "Shorten the tweet",
    group: "ai",
  },
  {
    label: "Emoji",
    icon: Smile,
    onClick: undefined,
    tooltip: "Open emoji picker",
    group: "regular",
    isPopover: true,
  },
  {
    label: "Ideas",
    icon: Lightbulb,
    onClick: undefined,
    tooltip: "Get ideas for the tweet",
    group: "regular",
  },
  {
    label: "Trends",
    icon: TrendingUp,
    onClick: undefined,
    tooltip: "Show trending topics",
    group: "regular",
    isPopover: true,
  },
  {
    label: "Add Tweet",
    icon: ListPlus,
    onClick: undefined,
    tooltip: "Add a new tweet to the thread",
    group: "regular",
  },
];

const toneOptions = [
  {
    value: "professional",
    label: "Professional",
    description: "Formal and business-like tone",
  },
  {
    value: "influencer",
    label: "Influencer",
    description: "Engaging and trendy social media style",
  },
  {
    value: "casual",
    label: "Casual",
    description: "Relaxed and informal tone",
  },
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm and approachable tone",
  },
  {
    value: "humorous",
    label: "Humorous",
    description: "Fun and entertaining tone",
  },
  {
    value: "enthusiastic",
    label: "Enthusiastic",
    description: "Energetic and excited tone",
  },
  {
    value: "informative",
    label: "Informative",
    description: "Clear and educational tone",
  },
  {
    value: "motivational",
    label: "Motivational",
    description: "Inspiring and uplifting tone",
  },
  {
    value: "authoritative",
    label: "Authoritative",
    description: "Confident and commanding tone",
  },
  {
    value: "empathetic",
    label: "Empathetic",
    description: "Understanding and compassionate tone",
  },
  {
    value: "sarcastic",
    label: "Sarcastic",
    description: "Witty and ironic tone",
  },
  {
    value: "storytelling",
    label: "Storytelling",
    description: "Narrative and engaging tone",
  },
  {
    value: "analytical",
    label: "Analytical",
    description: "Logical and data-driven tone",
  },
  {
    value: "controversial",
    label: "Controversial",
    description: "Thought-provoking and debate-inducing tone",
  },
  {
    value: "minimalist",
    label: "Minimalist",
    description: "Concise and straightforward tone",
  },
];

export interface ToolBoxProps {
  onAddTweet?: () => void;
  onEnhance?: () => void;
  onShowEmoji?: () => void;
  onShowTrends?: () => void;
  onShowSettings?: () => void;
  trendingTopics?: string[];
  onEmojiSelect?: (emoji: string) => void;
  onTrendSelect?: (trend: string) => void;
  onPromptSelect?: (prompt: any) => void;
  showIdeasDialog?: boolean;
  setShowIdeasDialog?: (show: boolean) => void;
  onAddEmoji?: () => void;
  onTone?: (tone: string) => void;
  onGrammar?: () => void;
  onAddHashtag?: () => void;
  onShorten?: () => void;
  isGenerating?: boolean;
}

const ToolBox: React.FC<ToolBoxProps> = ({
  onAddTweet,
  onEnhance,
  onShowEmoji,
  onShowTrends,
  onShowSettings,
  trendingTopics = [],
  onEmojiSelect,
  onTrendSelect,
  onPromptSelect,
  showIdeasDialog: externalShowIdeasDialog,
  setShowIdeasDialog: externalSetShowIdeasDialog,
  onAddEmoji,
  onTone,
  onGrammar,
  onAddHashtag,
  onShorten,
  isGenerating,
}) => {
  const [internalShowIdeasDialog, setInternalShowIdeasDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All prompts");
  const [search, setSearch] = useState("");
  const [filteredPrompts, setFilteredPrompts] = useState(promptData.prompts);
  const [isTonePopoverOpen, setIsTonePopoverOpen] = useState(false);

  // Use external state if provided, otherwise use internal state
  const showIdeasDialog = externalShowIdeasDialog ?? internalShowIdeasDialog;
  const setShowIdeasDialog =
    externalSetShowIdeasDialog ?? setInternalShowIdeasDialog;

  const actionHandlers = [
    onEnhance,
    onAddEmoji,
    onTone,
    onGrammar,
    onAddHashtag,
    onShorten,
    onShowSettings,
    onShowEmoji,
    onShowTrends,
    onAddTweet,
  ];

  const handleEmojiSelect = (emoji: any) => {
    const emojiString = emoji.native;
    onEmojiSelect?.(emojiString);
  };

  const handleToneSelect = (tone: string) => {
    if (isGenerating) return;
    onTone?.(tone);
    setIsTonePopoverOpen(false);
  };

  React.useEffect(() => {
    let filtered = promptData.prompts;
    if (selectedCategory !== "All prompts") {
      filtered = filtered.filter((p) =>
        p.categories.includes(selectedCategory)
      );
    }
    if (search.trim()) {
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFilteredPrompts(filtered);
  }, [selectedCategory, search]);

  function handleRandomPrompt() {
    if (filteredPrompts.length > 0) {
      const idx = Math.floor(Math.random() * filteredPrompts.length);
      const prompt = filteredPrompts[idx];
      onPromptSelect?.(prompt);
      setShowIdeasDialog(false);
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed left-0 right-0 bottom-6 flex justify-center z-50 w-full">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, type: "spring" }}
          className="pointer-events-auto bg-secondary/30 backdrop-blur-md rounded-2xl shadow-xl flex gap-1 px-3 py-1.5 border border-primary/10 border-solid w-max"
        >
          {actions.map((action, idx) => {
            const Icon = action.icon;
            const showDivider =
              idx > 0 && action.group !== actions[idx - 1].group;

            if (action.isPopover) {
              return (
                <React.Fragment key={action.label}>
                  {showDivider && (
                    <div className="w-px h-6 bg-primary/10 mx-1" />
                  )}
                  <Popover
                    open={
                      action.label === "Tone" ? isTonePopoverOpen : undefined
                    }
                    onOpenChange={
                      action.label === "Tone" ? setIsTonePopoverOpen : undefined
                    }
                  >
                    <HyperchoTooltip value={action.tooltip}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-foreground hover:bg-primary/10 transition-colors"
                          aria-label={action.label}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </HyperchoTooltip>
                    <PopoverContent
                      className="w-fit p-0 max-w-[352px]"
                      align="center"
                      side="top"
                    >
                      <Card>
                        <CardContent className="p-0 w-fit">
                          {action.label === "Emoji" ? (
                            <div className="w-fit">
                              <Picker
                                data={data}
                                onEmojiSelect={handleEmojiSelect}
                                set="native"
                                previewPosition="none"
                                skinTonePosition="none"
                                categories={[
                                  "frequent",
                                  "smileys",
                                  "people",
                                  "nature",
                                  "foods",
                                  "activity",
                                  "objects",
                                  "symbols",
                                ]}
                                searchPosition="sticky"
                                navPosition="top"
                                perLine={8}
                                maxFrequentRows={4}
                                locale="en"
                              />
                            </div>
                          ) : action.label === "Tone" ? (
                            <div className="p-3 w-[300px]">
                              <div className="text-sm font-medium text-muted-foreground mb-2">
                                Select a tone:
                              </div>
                              <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-x-hidden overflow-y-auto customScrollbar2 pr-2">
                                {toneOptions.map((tone) => (
                                  <Button
                                    key={tone.value}
                                    variant="ghost"
                                    className="w-full justify-start text-left py-2 h-fit"
                                    onClick={() => {
                                      handleToneSelect(tone.value);
                                    }}
                                    disabled={isGenerating}
                                  >
                                    <div className="flex flex-col items-start">
                                      <span className="text-xs font-medium text-foreground">
                                        {tone.label}
                                      </span>
                                      <span className="text-xs text-muted-foreground whitespace-normal break-words">
                                        {tone.description}
                                      </span>
                                    </div>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm font-medium text-muted-foreground mb-2 p-3">
                                Trending topics:
                              </div>
                              <div className="flex flex-wrap gap-2 p-3">
                                {trendingTopics.map((trend) => (
                                  <Badge
                                    key={trend}
                                    variant="outline"
                                    onClick={() => onTrendSelect?.(trend)}
                                  >
                                    {trend}
                                  </Badge>
                                ))}
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </PopoverContent>
                  </Popover>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={action.label}>
                {showDivider && <div className="w-px h-6 bg-primary/10 mx-1" />}
                <HyperchoTooltip value={action.tooltip}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      if (action.label === "Settings" && onShowSettings) {
                        onShowSettings();
                      } else if (action.label === "Ideas") {
                        setShowIdeasDialog(true);
                      } else if (
                        actionHandlers[idx] &&
                        typeof actionHandlers[idx] === "function"
                      ) {
                        actionHandlers[idx]!(action.label);
                      }
                    }}
                    aria-label={action.label}
                    disabled={isGenerating && action.group === "ai"}
                  >
                    {isGenerating && action.group === "ai" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </Button>
                </HyperchoTooltip>
              </React.Fragment>
            );
          })}
        </motion.div>
      </div>

      <Dialog open={showIdeasDialog} onOpenChange={setShowIdeasDialog}>
        <DialogContent className="sm:max-w-2xl bg-background border border-primary/10 p-0 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, type: "spring" }}
            className="w-full"
          >
            <div className="px-6 pt-6 pb-2 sticky top-0 z-10 bg-background">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-foreground">
                  Writing Prompts
                </DialogTitle>
                <DialogDescription className="text-base text-muted-foreground">
                  Choose a starting point for your next tweet or thread.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Search a prompt..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-md bg-background border border-primary/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                      <path
                        stroke="currentColor"
                        strokeWidth="2"
                        d="M21 21l-4.35-4.35m2.1-5.4a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
                      />
                    </svg>
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="ml-2 flex items-center gap-1 px-3 py-2 text-sm"
                  onClick={handleRandomPrompt}
                >
                  <span>Random</span>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <path
                      stroke="currentColor"
                      strokeWidth="2"
                      d="M4 4v5h.582M20 20v-5h-.581M19.418 9A7.974 7.974 0 0012 6c-3.042 0-5.824 1.135-7.938 3M4.582 15A7.974 7.974 0 0012 18c3.042 0 5.824-1.135 7.938-3"
                    />
                  </svg>
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {promptData.categories.map((cat) => (
                  <button
                    key={cat}
                    className={`px-3 py-1 rounded-full text-xs font-medium border border-primary/10 transition-colors ${
                      selectedCategory === cat
                        ? "bg-primary/20 text-foreground"
                        : "bg-background text-muted-foreground hover:bg-primary/10"
                    }`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 pb-6 pt-2 h-[500px] overflow-y-auto customScrollbar2">
              {filteredPrompts.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  No prompts found.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {filteredPrompts.map((prompt, idx) => (
                    <motion.div
                      key={prompt.title}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="rounded-xl bg-background border border-solid border-primary/10 p-4 flex flex-col gap-2 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer group hover:bg-primary/10"
                      onClick={() => {
                        onPromptSelect?.(prompt);
                        setShowIdeasDialog(false);
                      }}
                    >
                      <span className="text-base font-semibold text-foreground">
                        {prompt.title}
                      </span>
                      <span
                        className="text-sm text-muted-foreground leading-snug"
                        dangerouslySetInnerHTML={{
                          __html: prompt.description,
                        }}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ToolBox;
