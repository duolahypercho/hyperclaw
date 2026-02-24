import { Button } from "@/components/ui/button";
import { useX } from "../provider/xProvider";
import {
  Twitter,
  Plus,
  Calendar,
  Send,
  RefreshCw,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { cn } from "$/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUser } from "$/Providers/UserProv";
import { PostsList } from "../component/posts";
import { CopilotTextarea } from "$/components/Tool/AITextArea";
import { HTMLCopanionTextAreaElement } from "$/components/Tool/AITextArea/types";
import tweetEnhancePrompt from "$/components/Tool/PromptLibrary/library/tweetsEnhance";
import { CharacterCounter } from "../component/CharacterCounter";
import { EnhanceButton } from "@OS/AI/components/EnhanceButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TwitterPostPreview } from "../component/TwitterPostPreview";

export default function Component() {
  const {
    connectTwitter,
    twitterAccounts,
    activeAccount,
    handleTabChange,
    postContent: handlePostContent,
    loading,
    postsPagination,
    createNewPost,
  } = useX();

  // AI Generation States
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { userInfo } = useUser();
  const [immediateText, setImmediateText] = useState("");
  const [characterCount, setCharacterCount] = useState(0);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewPopoverOpen, setPreviewPopoverOpen] = useState(false);
  const popoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { makeSystemPrompt, relatedHistory } = tweetEnhancePrompt();

  // Handle popover hover with delay to allow smooth transition
  const handlePopoverEnter = useCallback(() => {
    if (popoverTimeoutRef.current) {
      clearTimeout(popoverTimeoutRef.current);
      popoverTimeoutRef.current = null;
    }
    if (immediateText) {
      setPreviewPopoverOpen(true);
    }
  }, [immediateText]);

  const handlePopoverLeave = useCallback(() => {
    popoverTimeoutRef.current = setTimeout(() => {
      setPreviewPopoverOpen(false);
    }, 150); // Small delay to allow mouse to move to popover content
  }, []);

  useEffect(() => {
    return () => {
      if (popoverTimeoutRef.current) {
        clearTimeout(popoverTimeoutRef.current);
      }
    };
  }, []);

  const posts = useMemo(() => postsPagination.posts, [postsPagination]);

  // Placeholder text options
  const placeholders = [
    "What's happening in the world of AI and startups? #Hypercho #AIInnovation",
    "Just launched a new feature! Here's how it's transforming entrepreneurship...",
    "From idea to execution - how AI is changing the game for startups 🚀 #FutureOfBusiness",
    "Breaking: Our platform just helped another entrepreneur reach their goals! #SuccessStory",
    "What's your biggest challenge in starting a business? Let's discuss! #EntrepreneurTalk",
    "AI + Entrepreneurship = The future is here. What do you think? #TechTrends",
    "Pro tip: Use AI to validate your business idea before launch! #StartupAdvice",
    "Exciting times ahead! Here's what we're building next... #StayTuned",
    "How can we make entrepreneurship more accessible? Share your thoughts! #CommunityInput",
    "Behind the scenes: How our AI platform works to help entrepreneurs succeed 🧠 #TechInsights",
  ];

  // Generate AI content
  const enhanceWithAIContent = async () => {
    textareaRef.current?.enhance({
      systemPrompt: makeSystemPrompt(
        "Billion follower influencer tweets enhancement",
        "You are a billion follower influencer on Twitter. You are helping people to write tweets that are more engaging and viral."
      ),
      history: relatedHistory,
    });
  };

  useEffect(() => {
    if (generating) {
      loading.startLoading("generating");
    } else {
      loading.stopLoading("generating");
    }
  }, [generating]);

  // Cycle through placeholders every 3 seconds
  useEffect(() => {
    if (!immediateText) {
      intervalRef.current = setInterval(() => {
        setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
      }, 3000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [immediateText, placeholders.length]);

  return (
    <div className="max-w-4xl w-full mx-auto h-fit">
      {/* Account List */}
      {twitterAccounts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center py-12"
        >
          <Twitter className="w-12 h-12 mx-auto text-blue-400 mb-4" />
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">
            No Twitter Accounts Connected
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Connect your Twitter account to schedule posts and manage your
            content.
          </p>
          <Button onClick={connectTwitter}>Connect Twitter</Button>
        </motion.div>
      )}

      {/* AI Post Generator */}
      {twitterAccounts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border rounded-none rounded-t-md bg-transparent">
            <CardHeader>
              <div className="flex items-center gap-4">
                <CardTitle className="text-xl font-semibold text-foreground/80">
                  Hey {userInfo.Firstname}, what would you like to post today?
                </CardTitle>
              </div>
              <CardDescription />
            </CardHeader>
            <CardContent>
              <div
                onClick={() => textareaRef.current?.focus()}
                className="relative flex flex-col bg-transparent border border-primary/10 border-solid outline-none text-foreground placeholder-[#9ba1ae] w-full resize-none min-h-[120px] leading-[20px] text-sm customScrollbar2 px-3 pt-2 pb-14 rounded-md hover:border-primary/20 transition-colors duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] focus-within:ring-[1px] focus-within:ring-offset-ring-input-ring-focus focus-within:ring-offset-1 cursor-text"
              >
                {/* @ts-ignore suggestionsStyle warning */}
                <CopilotTextarea
                  ref={textareaRef}
                  className={cn(
                    "w-full border-0 text-foreground bg-transparent resize-none overflow-y-auto",
                    !immediateText && "min-h-[56px]"
                  )}
                  placeholder=""
                  value={aiPrompt}
                  onValueChange={(value) => {
                    // Check character limit based on verification status
                    const maxLength = twitterAccounts[activeAccount]?.verified
                      ? 25000
                      : 280;
                    if (value.length <= maxLength) {
                      setAiPrompt(value);
                      setCharacterCount(value.length);
                    }
                  }}
                  onImmediateTextChange={(text) => {
                    setImmediateText(text);
                    setCharacterCount(text.length);
                  }}
                  autosuggestionsConfig={{
                    textareaPurpose:
                      "Billion follower influencer tweets enhancement",
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
                />
                <div className="absolute inset-0 flex items-start rounded-md pointer-events-none ml-2">
                  <AnimatePresence mode="wait">
                    {!immediateText && (
                      <motion.p
                        initial={{
                          y: 5,
                          opacity: 0,
                        }}
                        key={`current-placeholder-${currentPlaceholder}`}
                        animate={{
                          y: 0,
                          opacity: 1,
                        }}
                        exit={{
                          y: -15,
                          opacity: 0,
                        }}
                        transition={{
                          duration: 0.3,
                          ease: "linear",
                        }}
                        className="dark:text-zinc-500 text-sm font-normal text-neutral-500 pl-2 pt-2 text-left w-full"
                      >
                        {placeholders[currentPlaceholder]}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                {!twitterAccounts[activeAccount]?.verified &&
                  characterCount > 280 && (
                    <div className="absolute bottom-12 left-0 right-0 px-3 pb-2">
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/90 text-xs"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          Only the first 280 characters will be visible on the
                          timeline. You cannot post tweets over 280 characters
                          with a non-verified account.
                        </span>
                      </motion.div>
                    </div>
                  )}
                <div className="absolute bottom-0 left-0 right-0 flex justify-end items-center p-2">
                  <div className="flex gap-3">
                    <CharacterCounter
                      count={characterCount}
                      maxCount={280}
                      verified={twitterAccounts[activeAccount]?.verified}
                    />
                    <Popover
                      open={previewPopoverOpen}
                      onOpenChange={setPreviewPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 py-1 text-xs"
                          disabled={!immediateText}
                          onClick={() => setPreviewDialogOpen(true)}
                          onMouseEnter={handlePopoverEnter}
                          onMouseLeave={handlePopoverLeave}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-96 p-4"
                        align="end"
                        side="top"
                        sideOffset={8}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onMouseEnter={handlePopoverEnter}
                        onMouseLeave={handlePopoverLeave}
                      >
                        <TwitterPostPreview
                          content={immediateText}
                          twitterAccount={twitterAccounts[activeAccount]}
                        />
                      </PopoverContent>
                    </Popover>
                    <EnhanceButton
                      onClick={enhanceWithAIContent}
                      disabled={
                        loading.isLoading("posting") ||
                        loading.isLoading("connecting") ||
                        !immediateText
                      }
                      isLoading={loading.isLoading("generating")}
                      className="h-8 px-4 py-1 text-xs"
                      variant="outline"
                    />
                    <Button
                      onClick={() => {
                        handlePostContent(immediateText).then(() => {
                          setAiPrompt("");
                          setCharacterCount(0);
                        });
                      }}
                      disabled={
                        loading.isLoading("posting") ||
                        loading.isLoading("generating") ||
                        !immediateText ||
                        characterCount >
                          (twitterAccounts[activeAccount]?.verified
                            ? 25000
                            : 280)
                      }
                      variant="accent"
                      className="h-8 px-4 py-1 text-xs"
                    >
                      {loading.isLoading("posting") ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="mr-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </motion.div>
                          Posting...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Post
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Post Feed */}
      {twitterAccounts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="my-8 mt-0"
        >
          <div className="space-y-4">
            {posts && posts.length > 0 ? (
              <PostsList
                postsList={posts}
                twitterAccount={twitterAccounts[activeAccount]}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center py-12"
              >
                <div className="relative inline-block mb-6">
                  <Calendar className="w-12 h-12 mx-auto text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-foreground/80 mb-2">
                  Your Post Feed is Empty
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Start building your presence! Create your first post to engage
                  with your audience.
                </p>
                <Button
                  onClick={() => createNewPost({})}
                  variant="accent"
                  className="group"
                >
                  <motion.span
                    initial={{ x: 0 }}
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 group-hover:text-accent-foreground" />
                    Create First Post
                  </motion.span>
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post Preview</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <TwitterPostPreview
              content={immediateText}
              twitterAccount={twitterAccounts[activeAccount]}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
