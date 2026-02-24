import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Image as ImageIcon,
  X,
  Sparkles,
  Trash2,
  MoreHorizontal,
  BadgeCheck,
  ListPlus,
  Loader2,
  GripVertical,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useX } from "$/components/Tool/X/provider/xProvider";
import { CopilotTextarea } from "$/components/Tool/AITextArea";
import { cn } from "$/utils";
import { CharacterCounter } from "$/components/Tool/X/component/CharacterCounter";
import { motion, AnimatePresence } from "framer-motion";
import { HTMLCopanionTextAreaElement } from "$/components/Tool/AITextArea/types";
import { useDebouncedCallback } from "$/hooks/isDebounce";
import { AIPostType, xType, mediaType } from "$/components/Tool/X/types";
import { TweetAvatar } from "$/components/Tool/X/component/TweetAvatar";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import ToolBox from "./ToolBox";
import { Editor } from "slate";

interface MediaFile {
  id: string;
  file: File;
  url: string;
  type: "image" | "video";
}

interface SortableTweetItemProps {
  tweet: AIPostType;
  tweets: AIPostType[];
  index: number;
  textareaRefs: React.MutableRefObject<{
    [key: string]: React.RefObject<HTMLCopanionTextAreaElement>;
  }>;
  dragOverTweet: string | null;
  draggedTweet: string | null;
  handleTextChange: (index: number, text: string) => void;
  handleFileSelect: (index: number, files: FileList | null) => void;
  removeTweet: (index: number) => void;
  removeMedia: (index: number, mediaId: string) => void;
  fileInputRefs: React.MutableRefObject<{
    [key: string]: HTMLInputElement | null;
  }>;
  addTweetAfter: (index: number) => void;
  focusedIndex: number;
  onFocusTweet: (index: number, tweetId: string) => void;
  setIsGenerating: (generating: boolean) => void;
}

function SortableTweetItem({
  tweet,
  textareaRefs,
  index,
  dragOverTweet,
  draggedTweet,
  tweets,
  handleTextChange,
  handleFileSelect,
  removeTweet,
  removeMedia,
  fileInputRefs,
  addTweetAfter,
  focusedIndex,
  onFocusTweet,
  setIsGenerating,
}: SortableTweetItemProps) {
  const { twitterAccounts, activeAccount, loading } = useX();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tweet._id });
  // AI Generation States
  const [aiPrompt, setAiPrompt] = useState(tweet.content || "");
  const [generating, setGenerating] = useState(false);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);
  const [characterCount, setCharacterCount] = useState(0);

  // Store the ref in the parent's map when it's created
  useEffect(() => {
    if (textareaRef.current) {
      textareaRefs.current[tweet._id] = textareaRef;
    }
    const mapRef = textareaRefs.current;
    const id = tweet._id;
    return () => {
      delete mapRef[id];
    };
  }, [tweet._id, textareaRefs]);

  useEffect(() => {
    if (tweet) {
      setAiPrompt(tweet.content);
      setCharacterCount(tweet.content.length);
    }
  }, [tweet]);

  // Update parent's generating state when local state changes
  useEffect(() => {
    if (focusedIndex === index) {
      setIsGenerating(generating);
    }
  }, [generating, focusedIndex, index, setIsGenerating]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (loading.isLoading("fetchingPosts")) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-b relative transition-all duration-200 flex space-x-3 py-4 ${
        dragOverTweet === tweet._id ? "bg-blue-50" : ""
      } ${draggedTweet === tweet._id ? "opacity-50" : ""}`}
      onClick={() => onFocusTweet(index, tweet._id)}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground p-1"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      {/* Avatar */}
      <div className="relative flex-shrink-0 h-full !ml-0">
        <TweetAvatar
          profileImageUrl={
            twitterAccounts[activeAccount].profileImageUrl ||
            "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
          }
          username={twitterAccounts[activeAccount].username || "username"}
        />
      </div>
      <div className="flex flex-col flex-1">
        <div className="flex items-center gap-1 mb-0.5">
          <div className="flex items-center gap-1 w-full">
            <span className="font-semibold text-foreground/90 text-sm whitespace-nowrap">
              {twitterAccounts[activeAccount].name || "Ziwen Xu"}
            </span>
            {twitterAccounts[activeAccount].verified && (
              <BadgeCheck className="w-4 h-4 fill-accent flex-shrink-0" />
            )}
            <span className="truncate ml-1 flex items-center gap-2">
              <span className="text-foreground/50 text-sm">
                @{twitterAccounts[activeAccount].username || "username"}
              </span>
              <span className={`text-foreground/50 text-sm`}>· Draft</span>
            </span>
          </div>
        </div>
        {/* @ts-ignore suggestionsStyle warning */}
        <CopilotTextarea
          ref={textareaRef}
          className={cn("flex-1 border-0 text-foreground bg-transparent")}
          placeholder="Type your tweet here..."
          value={aiPrompt}
          onValueChange={(value: string) => {
            const maxLength = twitterAccounts[activeAccount]?.verified
              ? 25000
              : 280;
            if (value.length <= maxLength) {
              if (aiPrompt !== value) {
                setAiPrompt(value);
                setCharacterCount(value.length);
                handleTextChange(index, value);
              }
            }
          }}
          onImmediateTextChange={(text: string) => {
            setCharacterCount(text.length);
          }}
          autosuggestionsConfig={{
            textareaPurpose:
              "Twitter thread enhancement for a billion follower influencer",
            disabledAutosuggestionsWhenTyping: true,
            chatApiConfigs: {
              suggestionsApiConfig: {
                maxTokens: 50,
                stop: ["\n", ".", "?"],
              },
              enhanceTextApiConfig: {
                maxTokens: twitterAccounts[activeAccount]?.verified
                  ? 25000
                  : 280,
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
          onFocus={() => onFocusTweet(index, tweet._id)}
        />
        {/* Media Preview */}
        {tweet.media.length > 0 && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {tweet.media.map((singleMedia: mediaType) => (
              <div
                key={singleMedia._id}
                className="relative rounded-lg overflow-hidden bg-muted"
              >
                {singleMedia.type === "photo" ? (
                  <Image
                    src={singleMedia.url}
                    alt="Upload preview"
                    width={400}
                    height={128}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <video
                    src={singleMedia.url}
                    className="w-full h-32 object-cover"
                    controls
                  />
                )}
                <Button
                  onClick={() => removeMedia(index, singleMedia._id)}
                  size="sm"
                  variant="destructive"
                  className="absolute top-2 right-2 h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar: only show if focused */}
        <div
          className={cn(
            "flex items-center justify-end gap-2 px-4 pb-1 text-muted-foreground",
            focusedIndex !== index && "opacity-0 pointer-events-none invisible"
          )}
        >
          <span className="text-xs font-mono text-blue-300">#{index + 1}</span>
          <CharacterCounter
            count={characterCount}
            maxCount={280}
            verified={twitterAccounts[activeAccount]?.verified || false}
          />
          <HyperchoTooltip value="Add a new tweet after this one">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 p-0"
              onClick={() => {
                addTweetAfter(index);
              }}
            >
              <ListPlus className="h-4 w-4" />
            </Button>
          </HyperchoTooltip>
          <HyperchoTooltip value="Add image or video">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 p-0"
              onClick={() => {
                fileInputRefs.current[tweet._id]?.click();
              }}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </HyperchoTooltip>
          <HyperchoTooltip value="Enhance this tweet with AI">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 p-0 relative"
              onClick={() =>
                textareaRef.current?.enhance({
                  enhanceText: "Optimize this tweet for maximum engagement",
                  systemPrompt: `You are an expert social media strategist specializing in viral content creation. Your task is to enhance tweets by:\n                1. Making them more engaging and shareable\n                2. Adding relevant hashtags and emojis\n                3. Optimizing for character count\n                4. Incorporating trending topics when relevant\n                5. Using persuasive language and calls-to-action`,
                  history: [
                    {
                      id: "1",
                      role: "user",
                      content: "Just launched my new startup!",
                    },
                    {
                      id: "2",
                      role: "assistant",
                      content:
                        "🚀 Excited to announce the launch a new startup! We're revolutionizing Tech with AI. Join us on this journey! #StartupLife #Innovation #TechForGood 💡✨",
                    },
                    {
                      id: "3",
                      role: "user",
                      content: "Looking for a new job in tech",
                    },
                    {
                      id: "4",
                      role: "assistant",
                      content:
                        "👋 Open to new opportunities in the tech space! Passionate about AI. Let's connect and build something amazing together! #TechJobs #CareerChange #OpenToWork 🚀💻",
                    },
                  ],
                })
              }
              disabled={generating}
            >
              {generating ? (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </motion.div>
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </HyperchoTooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 p-0">
                <span className="sr-only">More</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  removeTweet(index);
                }}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thread connection line between avatars */}
      {tweets.length > 0 && index < tweets.length - 1 && (
        <div
          className="!ml-0 absolute left-[42px] top-[60px] w-0.5 bg-border z-0"
          style={{
            height: `calc(100% - 48px)`, // starts at bottom of avatar
          }}
        />
      )}
    </div>
  );
}

interface PromptType {
  title: string;
  description: string;
  categories: string[];
  aiInstructions: string;
}

const PromptPreview: React.FC<{
  prompt: PromptType;
  onClose: () => void;
  onApply: (prompt: PromptType) => void;
  onRemove: () => void;
  onChange: () => void;
}> = ({ prompt, onClose, onApply, onRemove, onChange }) => {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2 p-4 rounded-lg bg-primary/5 border border-primary/10"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {prompt.title}
          </h3>
          <p
            className="text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: prompt.description }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {prompt.categories.map((category) => {
          if (category !== "All prompts") {
            return (
              <Badge key={category} variant="secondary" className="text-xs">
                {category}
              </Badge>
            );
          }
          return null;
        })}
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary/10">
        <HyperchoTooltip value="Choose a different prompt">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onChange}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Change
          </Button>
        </HyperchoTooltip>
        <HyperchoTooltip value="Remove this prompt">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </HyperchoTooltip>
      </div>
    </motion.div>
  );
};

const TwitterThreadEditor: React.FC = () => {
  const { activePost, handleThreadOrder, createNewPost, deletePost } = useX();

  // Create placeholder tweet function
  const createPlaceholderTweet = (): AIPostType => ({
    _id: `placeholder-${Date.now()}`,
    content: "",
    media: [],
    status: "draft",
    metrics: {
      impressions: 0,
      engagements: 0,
      clicks: 0,
      likes: 0,
      retweets: 0,
      shares: 0,
      comments: 0,
      sentiment: {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
    },
    metadata: {
      hashtags: [],
      mentions: [],
      urls: [],
      categories: [],
      topics: [],
    },
    updatedAt: new Date(),
  });

  // Initialize tweets with placeholder if empty
  const [tweets, setTweets] = useState<AIPostType[]>(() => {
    const initialTweets = activePost?.postId || [];
    return initialTweets.length === 0
      ? [createPlaceholderTweet()]
      : initialTweets;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [draggedTweet, setDraggedTweet] = useState<string | null>(null);
  const [dragOverTweet, setDragOverTweet] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType | null>(null);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const textareaRefs = useRef<{
    [key: string]: React.RefObject<HTMLCopanionTextAreaElement>;
  }>({});

  const trendingTopics = [
    "#AI",
    "#TechNews",
    "#Startup",
    "#Programming",
    "#Design",
    "#MachineLearning",
    "#WebDev",
    "#Innovation",
    "#Future",
    "#Tech",
  ];

  const { patchEditPost } = useX();

  // Debounced patchEditPost to avoid excessive API calls
  const debouncedPatchEditPost = useDebouncedCallback(
    (tweetId: string, text: string) => {
      patchEditPost(tweetId, { content: text });
    },
    500
  );

  const handleTextChange = (index: number, text: string) => {
    setTweets((prev) =>
      prev.map((tweet, i) =>
        i === index ? { ...tweet, content: text } : tweet
      )
    );
    if (activePost?.postId[index]) {
      debouncedPatchEditPost(activePost.postId[index]._id, text);
    }
  };

  const removeTweet = (index: number) => {
    if (tweets.length === 1) return;
    setTweets((prev) => {
      const newTweets = prev.filter((_, i) => i !== index);
      setFocusedIndex(Math.max(0, index - 1));
      return newTweets;
    });
    if (activePost?.postId[index]) {
      deletePost(activePost.postId[index]._id);
    }
  };

  const handleFileSelect = (index: number, files: FileList | null) => {
    if (!files) return;
    // Implement file upload logic here, using index
    // Example: upload to backend with activePost?.postId[index]._id
  };

  const removeMedia = (tweetIndex: number, mediaId: string) => {
    setTweets((prev) =>
      prev.map((tweet, i) => {
        if (i === tweetIndex) {
          const file = tweet.media.find((f) => f._id === mediaId);
          if (file) URL.revokeObjectURL(file.url);
          return {
            ...tweet,
            media: tweet.media.filter((f) => f._id !== mediaId),
          };
        }
        return tweet;
      })
    );
    // Optionally call backend to remove media using activePost?.postId[tweetIndex]._id
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!active || !over) return;
    if (active.id !== over.id) {
      const oldIndex = tweets.findIndex((t) => t._id === active.id);
      const newIndex = tweets.findIndex((t) => t._id === over.id);
      const newTweets = arrayMove(tweets, oldIndex, newIndex);

      setTweets(newTweets);
      if (activePost) {
        const newOrder = arrayMove(activePost.postId, oldIndex, newIndex).map(
          (t) => t._id
        );
        handleThreadOrder(activePost._id, newOrder);
      }
    }
  };

  const addTweetAfter = async (index: number) => {
    let tempId = Math.random().toString(36).substr(2, 9);
    setTweets((prev) => {
      const newTweet: AIPostType = {
        _id: tempId,
        status: "draft",
        content: "",
        media: [],
        metrics: {
          impressions: 0,
          engagements: 0,
          clicks: 0,
          likes: 0,
          retweets: 0,
          shares: 0,
          comments: 0,
          sentiment: {
            positive: 0,
            neutral: 0,
            negative: 0,
          },
        },
        metadata: {
          hashtags: [],
          mentions: [],
          urls: [],
          categories: [],
          topics: [],
        },
        updatedAt: new Date(),
        postedAt: undefined,
      };
      const newTweets = [...prev];
      newTweets.splice(index + 1, 0, newTweet);
      setFocusedIndex(index + 1);
      return newTweets;
    });
    if (activePost) {
      await createNewPost({ postId: activePost._id, order: index });
    }
    setFocusedIndex(index + 1);
  };

  const handleFocusTweet = (index: number, tweetId: string) => {
    setFocusedIndex(index);
  };

  // On initial render, set focus to the first tweet if none is focused
  React.useEffect(() => {
    if (
      tweets.length > 0 &&
      (focusedIndex < 0 || focusedIndex >= tweets.length)
    ) {
      setFocusedIndex(0);
    }
  }, [focusedIndex, tweets]);

  // Ensure there's always at least one tweet (placeholder)
  React.useEffect(() => {
    if (tweets.length === 0) {
      setTweets([createPlaceholderTweet()]);
    }
  }, [tweets.length]);

  const handleEmojiSelect = (emoji: string) => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.insertText(emoji);
    }
  };

  const handleTrendSelect = (trend: string) => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.insertText(trend);
    }
  };

  const toggleSettings = () => {
    if (showSettings) {
      setShowSettings(false);
    } else {
      setShowSettings(true);
    }
  };

  const handlePromptSelect = (prompt: PromptType) => {
    setSelectedPrompt(prompt);
  };

  const handlePromptApply = (prompt: PromptType) => {
    // Here you can implement the logic to apply the prompt to the tweet
    // For example, you could use the prompt to enhance the tweet content
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        enhanceText: prompt.title,
        systemPrompt: prompt.aiInstructions,
      });
    }
  };

  const handlePromptChange = () => {
    setShowIdeasDialog(true);
  };

  const handleEnhanceTweet = () => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        systemPrompt: `You are an expert social media strategist specializing in viral content creation. Your task is to enhance tweets by:
        1. Making them more engaging and shareable
        2. Adding relevant hashtags and emojis
        3. Optimizing for character count
        4. Incorporating trending topics when relevant
        5. Using persuasive language and calls-to-action
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>Just launched my new startup!</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content:
              "🚀 Excited to announce the launch of our AI-powered startup! We're revolutionizing how teams collaborate. Join us on this journey! #StartupLife #Innovation #TechForGood 💡✨",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>Looking for a new job in tech</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content:
              "👋 Open to new opportunities in the tech space! Passionate about AI and building scalable solutions. Let's connect and build something amazing together! #TechJobs #CareerChange #OpenToWork 🚀💻",
          },
        ],
      });
    }
  };

  const handleAddEmoji = () => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        systemPrompt: `You are an emoji expert. Your task is to:
        1. Add relevant emojis that match the tweet's content and tone
        2. Place emojis strategically to enhance readability
        3. Use emojis that are commonly used on Twitter
        4. Don't overuse emojis - keep it tasteful
        5. Maintain the original message while adding emojis
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>Just finished a 10-mile run!</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content:
              "🏃‍♂️ Just finished a 10-mile run! 💪 Feeling amazing and ready to conquer the day! #FitnessJourney",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>Working on a new project all night</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content:
              "🌙 Working on a new project all night! 💻 The grind never stops when you're passionate about what you do! #DeveloperLife",
          },
        ],
      });
    }
  };

  const handleTone = (tone: string) => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      const toneInstructions = {
        professional:
          "Use a formal, business-like tone with clear and concise language. Maintain professionalism while being engaging.",
        influencer:
          "Use an engaging, trendy tone that resonates with social media audiences. Include relevant hashtags and emojis strategically. For example: Yo, what's good?! 😎 Super hyped to drop this vid, SMASH that like button, fam! 💥 Let's get those views POPPIN'! #ViralVibesOnly #TikTok #Instagram #SocialMedia #Viral #Trending #Fashion #TikTok #Instagram #SocialMedia #Viral",
        casual:
          "Use a relaxed, informal tone that feels natural and conversational. Keep it friendly but not too formal.",
        friendly:
          "Use a warm and approachable tone that makes the reader feel welcome and valued. Be encouraging and supportive.",
        humorous:
          "Use a fun and entertaining tone with appropriate humor. Keep it light-hearted while maintaining the message's clarity.",
        enthusiastic:
          "Use an energetic and excited tone that conveys passion and excitement. Be positive and engaging.",
        informative:
          "Use a clear and educational tone that focuses on delivering valuable information. Be precise and well-structured.",
        motivational:
          "Use an inspiring and uplifting tone that encourages and empowers the reader. Include positive affirmations and calls to action.",
        authoritative:
          "Use a confident and commanding tone that establishes expertise and credibility. Be assertive but not aggressive.",
        empathetic:
          "Use an understanding and compassionate tone that shows emotional intelligence. Acknowledge and validate feelings.",
        sarcastic:
          "Use a witty and ironic tone that adds humor through clever wordplay. Keep it tasteful and not mean-spirited.",
        storytelling:
          "Use a narrative and engaging tone that draws readers in. Create a clear beginning, middle, and end.",
        analytical:
          "Use a logical and data-driven tone that presents information clearly. Focus on facts and evidence.",
        controversial:
          "Use a thought-provoking tone that encourages discussion. Present different perspectives respectfully.",
        minimalist:
          "Use a concise and straightforward tone that gets to the point. Eliminate unnecessary words and phrases.",
      };

      textarea.enhance({
        systemPrompt: `You are a tone expert. Your task is to:
        1. Apply a ${tone} tone to the content
        2. ${toneInstructions[tone as keyof typeof toneInstructions]}
        3. Keep it authentic and natural
        4. Maintain the original message while improving tone
        5. Use active voice and present tense
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>The new feature has been implemented successfully.</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content:
              "Just shipped an awesome new feature! 🎉 Can't wait to see how you all use it. Drop a comment if you need any help getting started!",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>The meeting was productive and we achieved our goals.</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content:
              "Had an amazing meeting today! 🎯 We crushed our goals and I'm super excited about what's coming next. Who else loves when a plan comes together?",
          },
        ],
      });
    }
  };

  const handleGrammar = () => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        systemPrompt: `You are a grammar expert. Your task is to:
        1. Fix any grammatical errors
        2. Improve sentence structure
        3. Ensure proper punctuation
        4. Maintain Twitter's casual style while being grammatically correct
        5. Keep the original message intact
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>just launched r new product its gonna be huge</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content: "Just launched our new product! It's going to be huge! 🚀",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>cant wait 2 show u guys what we been working on</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content:
              "Can't wait to show you guys what we've been working on! 👀",
          },
        ],
      });
    }
  };

  const handleAddHashtag = () => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        systemPrompt: `You are a hashtag expert. Your task is to:
        1. Add relevant hashtags that match the tweet's content
        2. Include trending hashtags when appropriate
        3. Use a mix of popular and niche hashtags
        4. Keep hashtags relevant and not spammy
        5. Place hashtags naturally within the tweet
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>Just finished coding a new feature</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content:
              "Just finished coding a new feature! #CodingLife #WebDev #100DaysOfCode #DeveloperLife",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>Starting a new project today</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content:
              "Starting a new project today! #StartupLife #TechStartup #Innovation #Entrepreneurship",
          },
        ],
      });
    }
  };

  const handleShorten = () => {
    const tweet = tweets[focusedIndex];
    const textarea = textareaRefs.current[tweet?._id]?.current;
    if (textarea) {
      textarea.enhance({
        systemPrompt: `You are a concise writing expert. Your task is to:
        1. Shorten the tweet while keeping its core message
        2. Remove unnecessary words and phrases
        3. Use shorter alternatives for long words
        4. Maintain readability and clarity
        5. Keep important hashtags and mentions
        ${
          selectedPrompt
            ? `Below is the additional instructions: ${selectedPrompt.aiInstructions}`
            : ""
        }`,
        history: [
          {
            id: "1",
            role: "user",
            content:
              "<EnhancedText>I am extremely excited to announce that we have successfully completed the development of our new feature that will revolutionize the way users interact with our platform.</EnhancedText>",
          },
          {
            id: "2",
            role: "assistant",
            content: "Thrilled to launch our game-changing new feature! 🚀",
          },
          {
            id: "3",
            role: "user",
            content:
              "<EnhancedText>We would like to express our sincere gratitude to all of our amazing users who have provided valuable feedback and suggestions for improving our product.</EnhancedText>",
          },
          {
            id: "4",
            role: "assistant",
            content: "Huge thanks to our amazing users for your feedback! 🙏",
          },
        ],
      });
    }
  };

  // If no activePost, show a create new draft UI
  if (!activePost) {
    return (
      <div className="flex flex-1 items-center justify-center h-full w-full bg-background">
        <Card className="p-8 flex flex-col items-center gap-4 shadow-lg bg-card">
          <span className="text-2xl font-semibold text-foreground mb-2">
            No Draft Selected
          </span>
          <span className="text-muted-foreground mb-4">
            Start a new Twitter thread draft to begin writing.
          </span>
          <Button
            size="lg"
            className="rounded-full px-8"
            onClick={() => createNewPost()}
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Create New Draft
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center bg-background flex-1 w-full h-full relative">
      <TooltipProvider>
        <div className="max-w-4xl w-full mx-auto h-full">
          {/* Thread Tweets */}
          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext
              items={tweets.map((tweet) => tweet._id)}
              strategy={verticalListSortingStrategy}
            >
              {tweets.map((tweet, index) => (
                <div key={tweet._id}>
                  <SortableTweetItem
                    tweet={tweet}
                    tweets={tweets}
                    textareaRefs={textareaRefs}
                    index={index}
                    dragOverTweet={dragOverTweet}
                    draggedTweet={draggedTweet}
                    handleTextChange={(i, text) => handleTextChange(i, text)}
                    handleFileSelect={(i, files) => handleFileSelect(i, files)}
                    removeTweet={(i) => removeTweet(i)}
                    removeMedia={(i, mediaId) => removeMedia(i, mediaId)}
                    fileInputRefs={fileInputRefs}
                    addTweetAfter={(i) => addTweetAfter(i)}
                    focusedIndex={focusedIndex}
                    onFocusTweet={(i, tweetId) => handleFocusTweet(i, tweetId)}
                    setIsGenerating={setIsGenerating}
                  />
                  {focusedIndex === index && selectedPrompt && (
                    <PromptPreview
                      prompt={selectedPrompt}
                      onClose={() => setSelectedPrompt(null)}
                      onApply={handlePromptApply}
                      onRemove={() => setSelectedPrompt(null)}
                      onChange={handlePromptChange}
                    />
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>
          <div className="h-20" />
        </div>
        {/* Toolbox absolute at bottom */}
        <ToolBox
          onAddTweet={() => addTweetAfter(tweets.length - 1)}
          onEnhance={handleEnhanceTweet}
          onShowSettings={toggleSettings}
          trendingTopics={trendingTopics}
          onEmojiSelect={handleEmojiSelect}
          onTrendSelect={handleTrendSelect}
          onPromptSelect={handlePromptSelect}
          showIdeasDialog={showIdeasDialog}
          setShowIdeasDialog={setShowIdeasDialog}
          onAddEmoji={handleAddEmoji}
          onTone={handleTone}
          onGrammar={handleGrammar}
          onAddHashtag={handleAddHashtag}
          onShorten={handleShorten}
          isGenerating={isGenerating}
        />
      </TooltipProvider>
    </div>
  );
};

export default TwitterThreadEditor;
