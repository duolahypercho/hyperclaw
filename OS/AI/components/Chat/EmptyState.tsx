import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SuggestionItem } from "@OS/AI/components/Chat";
import { Suggestions } from "$/OS/AI/components/Chat/Suggestions";
import { Bot } from "lucide-react";

// Empty State Component
export const EmptyState = ({
  userAvatar,
  assistantAvatar,
  onHintClick,
  personality,
  suggestions,
  onSuggestionClick,
  isLoadingSuggestions = false,
}: {
  userAvatar?: any;
  assistantAvatar?: any;
  onHintClick?: (message: string) => void;
  personality?: any;
  suggestions?: SuggestionItem[];
  onSuggestionClick?: (message: string) => void;
  isLoadingSuggestions?: boolean;
}) => {
  const defaultQuickPrompts = [
    {
      id: "what-can-you-do",
      title: "What can you do?",
      message:
        "Can you explain all the things you can help me with as my AI agent?",
    },
    {
      id: "how-to-begin",
      title: "How do I begin?",
      message:
        "I'm new here. Can you guide me step by step on how to get started?",
    },
    {
      id: "explain-process",
      title: "Explain your process",
      message:
        "Can you explain how you approach solving problems or generating business strategies?",
    },
    {
      id: "creative-ideas",
      title: "Creative ideas",
      message: "Help me brainstorm some creative ideas for my next project",
    },
  ];

  const displaySuggestions =
    suggestions && suggestions.length > 0 ? suggestions : defaultQuickPrompts;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-8"
    >
      <Avatar className="w-16 h-16 mx-auto mb-2 ring-2 ring-primary/20">
        <AvatarImage
          src={assistantAvatar?.src}
          alt={assistantAvatar?.alt || "Agent"}
        />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {assistantAvatar?.fallback
            ? <span>{assistantAvatar.fallback}</span>
            : <Bot className="w-4 h-4" />}
        </AvatarFallback>
      </Avatar>

      <h3 className="font-semibold text-foreground mb-2 text-lg">
        Welcome to {personality?.name || "Agent"}!
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        {personality?.tag ||
          "Your AI companion for daily life. I'm here to help you with anything you need!"}
      </p>

      <Suggestions
        suggestions={displaySuggestions}
        onSuggestionClick={onSuggestionClick || onHintClick || (() => {})}
        isLoading={isLoadingSuggestions}
      />
    </motion.div>
  );
};
