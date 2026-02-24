"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SuggestionItem } from ".";

// Props interface for Suggestions component
export interface SuggestionsProps {
  suggestions: SuggestionItem[];
  onSuggestionClick: (message: string) => void;
  isLoading?: boolean;
}

// Suggestions component
export const Suggestions = ({
  suggestions,
  onSuggestionClick,
  isLoading = false,
}: SuggestionsProps) => {
  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
        {suggestions.map((suggestion, idx) => (
          <motion.div
            key={suggestion.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-auto p-3 text-left justify-start gap-2 w-full"
              onClick={() => onSuggestionClick(suggestion.message)}
              disabled={isLoading}
            >
              {suggestion.icon && (
                <span className="text-xs">{suggestion.icon}</span>
              )}
              <span className="text-xs">{suggestion.title}</span>
            </Button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
