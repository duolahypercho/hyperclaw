import React, { useEffect } from "react";
import { useX } from "../provider/xProvider";
import { PostsList } from "../component/posts";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PostList() {
  const {
    fetchPosts,
    twitterAccounts,
    activeAccount,
    createNewPost,
    postsPagination,
    loading,
    filteredPosts,
    handleTabChange,
  } = useX();

  useEffect(() => {
    const loadPosts = async () => {
      await fetchPosts();
    };
    if (twitterAccounts.length > 0 && activeAccount >= 0) {
      loadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount, twitterAccounts.length]);

  if (loading.isLoading("fetchingPosts")) {
    return (
      <div
        className={`flex flex-col items-center justify-center flex-1 w-full h-full px-4 py-8`}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-3xl"
        >
          {/* Search bar removed */}
        </motion.div>
        <div className="w-full max-w-3xl flex flex-col items-center justify-center mt-8">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-2" />
          <span className="text-base text-muted-foreground font-medium">
            Loading posts...
          </span>
        </div>
      </div>
    );
  }

  if (postsPagination.posts.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center flex-1 w-full h-full px-4 py-8`}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-4"
        >
          <Inbox className="w-16 h-16 text-muted-foreground/60" />
          <span className="text-lg text-muted-foreground font-semibold">
            No posts found
          </span>
          <Button
            onClick={() => createNewPost({})}
            className="mt-2 px-6 py-2 rounded-lg text-base font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Create a new post
          </Button>
        </motion.div>
      </div>
    );
  }

  if (filteredPosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full h-full px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
              <Inbox className="w-8 h-8 text-muted-foreground/60" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs text-primary font-semibold">0</span>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              No posts match your search
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Try adjusting your search criteria or create a new post to get
              started.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleTabChange("home");
              }}
              className="px-4 py-2 text-sm"
            >
              Back to home
            </Button>
            <Button
              onClick={() => createNewPost({})}
              size="sm"
              className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create new post
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl w-full mx-auto h-fit">
      <AnimatePresence>
        <motion.div
          key="list"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-4"
        >
          <PostsList
            postsList={filteredPosts}
            twitterAccount={twitterAccounts[activeAccount]}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
