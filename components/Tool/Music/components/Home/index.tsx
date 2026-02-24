import { useRef, useState, useEffect, memo, useMemo, useCallback } from "react";
import { useMusicTool } from "../../Provider/musicProvider";
import MusicListing from "./MusicListing";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Music, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Throttle function to limit how often a function can be called
const throttle = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastExecTime = 0;

  return (...args: any[]) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
};

// Skeleton component for genre cards
const GenreCardSkeleton = memo(() => (
  <div className="flex flex-col items-center bg-card rounded-xl shadow-sm border border-border">
    <div className="w-full px-3 py-1.5 flex flex-col items-start">
      <Skeleton className="h-4 w-20" />
    </div>
  </div>
));

GenreCardSkeleton.displayName = "GenreCardSkeleton";

// Optimized genre card component
const GenreCard = memo(
  ({
    _id,
    name,
    isActive,
    onClick,
  }: {
    _id: string;
    name: string;
    isActive: boolean;
    onClick: (id: string) => void;
  }) => (
    <div
      className={`flex flex-col items-center justify-center bg-card rounded-xl shadow-sm cursor-pointer transition-all duration-200 ease-out hover:shadow-sm hover:scale-[1.02] active:scale-95 will-change-transform ${
        isActive
          ? "bg-primary text-primary-foreground shadow-lg"
          : "border border-solid border-border"
      }`}
      onClick={() => onClick(_id)}
      style={{ flex: "0 0 auto" }}
    >
      <div className="w-full px-3 py-1.5 flex flex-col items-center justify-center gap-1">
        <span className="text-sm font-medium truncate w-full text-center">
          {name}
        </span>
      </div>
    </div>
  )
);

GenreCard.displayName = "GenreCard";

const MusicHome = () => {
  const {
    genre,
    handleGenreClick,
    songs,
    selectedGenre,
    isGenreLoading,
    handleLoadMoreSongs,
    hasMore,
    isLoadingMore,
  } = useMusicTool();

  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateShadows = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollLeft, clientWidth, scrollWidth } = el;
    setShowLeft(scrollLeft > 0);
    setShowRight(scrollLeft + clientWidth < scrollWidth);
  }, []);

  // Throttled version of updateShadows to improve performance
  const throttledUpdateShadows = useMemo(
    () => throttle(updateShadows, 50),
    [updateShadows]
  );

  const scrollBy = useCallback((direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = 200;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initial check
    updateShadows();

    // Add throttled scroll listener
    el.addEventListener("scroll", throttledUpdateShadows, { passive: true });

    // Add resize listener to update buttons when screen size changes
    window.addEventListener("resize", throttledUpdateShadows);

    return () => {
      el.removeEventListener("scroll", throttledUpdateShadows);
      window.removeEventListener("resize", throttledUpdateShadows);
    };
  }, [updateShadows, throttledUpdateShadows]);

  // Update scroll buttons when genre data changes
  useEffect(() => {
    // Small delay to ensure DOM is updated after genre data loads
    const timer = setTimeout(() => {
      updateShadows();
    }, 100);

    return () => clearTimeout(timer);
  }, [genre, updateShadows]);

  // Intersection observer callback for infinite scroll
  const loadMoreCallback = useCallback(
    (node: HTMLDivElement) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      // Don't observe if loading or no more items
      if (isLoadingMore || !hasMore) return;

      // Create new observer
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
            handleLoadMoreSongs();
          }
        },
        {
          rootMargin: "100px", // Start loading 100px before the element comes into view
          threshold: 0.1,
        }
      );

      // Observe the node
      if (node) {
        observerRef.current.observe(node);
      }
    },
    [handleLoadMoreSongs, hasMore, isLoadingMore]
  );

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Memoize genre items to prevent unnecessary re-renders
  const genreItems = useMemo(() => {
    const genreCards = genre.map(({ _id, name }) => {
      const isActive = selectedGenre === _id;

      return (
        <GenreCard
          key={_id}
          _id={_id}
          name={name}
          isActive={isActive}
          onClick={handleGenreClick}
        />
      );
    });

    return genreCards;
  }, [genre, selectedGenre, handleGenreClick]);

  // Render skeleton cards when loading
  const renderGenreContent = () => {
    if (isGenreLoading) {
      return Array.from({ length: 6 }, (_, index) => (
        <GenreCardSkeleton key={`skeleton-${index}`} />
      ));
    }

    if (genre.length === 0) {
      return (
        <div className="flex items-center justify-center w-full py-8">
          <div className="text-center">
            <Music className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No genres available</p>
          </div>
        </div>
      );
    }

    return genreItems;
  };

  return (
    <>
      {/* Genre Cards Row */}
      <div className="flex flex-col overflow-x-auto py-4 px-1">
        <h1 className="text-xl font-semibold">Genres</h1>
        <div className="relative w-full">
          {!isGenreLoading && genre.length > 0 && showLeft && (
            <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-r from-background to-transparent pointer-events-none">
              <Button
                className="h-fit w-fit p-1.5 bg-primary/30 rounded-full pointer-events-auto transition-opacity duration-200"
                onClick={() => scrollBy("left")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
          {!isGenreLoading && genre.length > 0 && showRight && (
            <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-background to-transparent pointer-events-none">
              <Button
                className="h-fit w-fit p-1.5 bg-primary/30 rounded-full pointer-events-auto transition-opacity duration-200"
                onClick={() => scrollBy("right")}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div
            ref={containerRef}
            className="flex gap-3 overflow-x-auto px-6 py-2 scroll-smooth"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {renderGenreContent()}
          </div>
        </div>
      </div>
      {/* Songs Listing */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            {selectedGenre
              ? `${
                  genre.find((g) => g._id === selectedGenre)?.name || "Genre"
                } Songs`
              : "All Songs"}
          </h1>
          {selectedGenre && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
              Filtered
            </span>
          )}
        </div>
        <div className="grid grid-cols-[48px_1fr_80px_80px] gap-4 p-2 text-xs text-muted-foreground font-medium">
          <div>Cover</div>
          <div>Title</div>
          <div>Duration</div>
          <div></div>
        </div>
        <MusicListing songs={songs} loadMoreRef={loadMoreCallback} />
      </div>
    </>
  );
};

export default memo(MusicHome);
