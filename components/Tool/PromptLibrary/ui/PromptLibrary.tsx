"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { getLibraryPrompts, getPromptCategories } from "../api/PromptLibrary";
import { Prompt, CategoryType } from "../types";
import { getMediaUrl } from "$/utils";
import { usePromptLibrary } from "../provider/PromptProv";

interface PromptLibraryUIProps {
  className?: string;
}

export const PromptLibraryUI: React.FC<PromptLibraryUIProps> = ({
  className = "",
}) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimeoutRef = useRef<number | null>(null);
  const { toast } = useToast();
  const observer = useRef<IntersectionObserver>();
  const searchQueryRef = useRef(searchQuery);
  const { handlePromptChange, selectedCategory, page, setPage } =
    usePromptLibrary();
  const selectedCategoryRef = useRef(selectedCategory);
  const pageRef = useRef(page);
  const loadingRef = useRef(loading);

  // Update refs when state changes
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await getPromptCategories();
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchPrompts = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;

      try {
        setLoading(true);
        const currentPage = reset ? 1 : pageRef.current;

        const response = await getLibraryPrompts({
          page: currentPage,
          limit: 12,
          category: selectedCategoryRef.current || undefined,
          search: searchQueryRef.current || undefined,
        });

        if (response.success && response.data) {
          const newPrompts = response.data.prompts;
          const pagination = response.data.pagination;

          if (reset) {
            setPrompts(newPrompts);
          } else {
            setPrompts((prev) => [...prev, ...newPrompts]);
          }

          setHasMore(pagination.hasNext);
          setPage(currentPage + 1);
        }
      } catch (error) {
        console.error("Failed to fetch prompts:", error);
        toast({
          title: "Error",
          description: "Failed to load prompts",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [setPage, toast]
  );

  // Fetch initial prompts only once
  useEffect(() => {
    fetchPrompts(true);
  }, [fetchPrompts]);

  // Handle search with debouncing - separate from fetchPrompts dependency
  useEffect(() => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    const timeoutId = window.setTimeout(() => {
      setPage(1);
      fetchPrompts(true);
    }, 200);

    searchTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, selectedCategory, fetchPrompts, setPage]);

  const lastPromptElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading) return;

      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchPrompts(false);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore, fetchPrompts]
  );

  const handlePromptClick = (prompt: Prompt) => {
    handlePromptChange(prompt._id);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Header Section
  const HeaderSection = () => (
    <div className="flex flex-col items-center justify-center text-center my-2">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">
        <span className="text-foreground">Explore </span>
        <span className="text-primary">Hyperclaw Library</span>
        <span className="text-foreground"></span>
      </h1>
      <p className="text-base text-muted-foreground">
        What are you looking for?
      </p>
    </div>
  );

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
  };

  // --- Refactored PromptCard ---
  const PromptCard: React.FC<{ prompt: Prompt; isLast?: boolean }> = ({
    prompt,
    isLast = false,
  }) => {
    const cardRef = isLast ? lastPromptElementRef : null;
    return (
      <div ref={cardRef} className="h-full">
        <Card
          className="relative h-full cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border border-border/50 hover:border-primary/30 group rounded-xl bg-card"
          onClick={() => handlePromptClick(prompt)}
        >
          {/* Star and More icons */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <button
              className="p-1 rounded-full hover:bg-primary/10 transition"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Star className="w-3 h-3 text-orange-500 fill-orange-500 dark:text-yellow-400 dark:fill-yellow-400" />
            </button>
          </div>
          <CardHeader className="pb-2 pt-6">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={getMediaUrl(prompt.promptImage)}
                  alt={prompt.author}
                />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(prompt.author)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {prompt.promptName}
                </CardTitle>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  @{prompt.author}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2 min-h-[40px]">
              {prompt.promptDescription}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {prompt.promptCategory}
              </Badge>
            </div>
            <div className="flex items-center justify-end text-xs text-muted-foreground mt-2">
              <span>{getTimeAgo(prompt.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 10 }).map((_, index) => (
        <Card
          key={index}
          className="relative h-full border border-border/50 rounded-xl bg-card"
        >
          {/* Star and More icons skeleton */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
          <CardHeader className="pb-2 pt-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-5 w-3/4 mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3 mb-2" />
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex items-center justify-between mt-2">
              <Skeleton className="h-3 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header Section */}
      <HeaderSection />
      {/* Search and Categories */}
      <div className="space-y-3 flex flex-col items-center justify-center">
        {/* Search Bar */}
        <div className="w-full relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
          />
        </div>
      </div>
      {/* Content */}
      <div className="min-h-[400px]">
        {initialLoading || loading ? (
          <LoadingSkeleton />
        ) : (
          <AnimatePresence mode="wait">
            {prompts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No prompts found
                </h3>
                <p className="text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {prompts.map((prompt, index) => {
                  const isLast = index === prompts.length - 1;
                  return (
                    <PromptCard
                      key={prompt._id}
                      prompt={prompt}
                      isLast={isLast}
                    />
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default PromptLibraryUI;
