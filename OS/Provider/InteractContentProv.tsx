import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  memo,
  useCallback,
} from "react";
import { useInteractApp } from "@OS/Provider/InteractAppProv";
import { useSession } from "next-auth/react";

const InteractContentContext = createContext({});

export const InteractContentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <InteractContentContext.Provider value={{}}>
      {children}
    </InteractContentContext.Provider>
  );
};

// Simple loading placeholder
const LoadingPlaceholder = memo(() => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
));

LoadingPlaceholder.displayName = "LoadingPlaceholder";

// Memoized wrapper to prevent re-renders
const MemoizedContent = memo(({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
});

MemoizedContent.displayName = "MemoizedContent";

// Optimized content component that pauses heavy operations during drag
export const InteractContent = ({
  value,
  children,
  publicTab = false,
  lazy = false,
  preserveState = true,
  debug = false,
}: {
  value: string;
  children: React.ReactNode;
  publicTab?: boolean;
  lazy?: boolean;
  preserveState?: boolean;
  debug?: boolean;
}) => {
  const { currentActiveTab, appSchema } = useInteractApp();
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const mountTime = useRef<number>(Date.now());
  const { status } = useSession();

  // Determine if this content should be visible (first section may be "custom" with no items)
  const firstSection = appSchema.sidebar?.sections?.[0];
  const defaultTabId =
    firstSection && "items" in firstSection
      ? firstSection.items?.[0]?.id
      : undefined;
  const isVisible =
    currentActiveTab === value ||
    (!currentActiveTab && defaultTabId === value);

  // Track if component has ever been visible (for lazy loading)
  useEffect(() => {
    if (isVisible && !hasBeenVisible) {
      setHasBeenVisible(true);
      const now = Date.now();
      const firstLoadTime = now - mountTime.current;
    }
  }, [isVisible, hasBeenVisible, value, debug]);

  // Progressive loading - immediate for better responsiveness
  useEffect(() => {
    if (isVisible && !isLoaded) {
      // Immediate loading for better responsiveness
      setIsLoaded(true);
    }
  }, [isVisible, isLoaded]);

  // For lazy loading, don't render until first visible
  if (lazy && !hasBeenVisible) {
    return null;
  }

  // For non-preserve state, use simple show/hide
  if (!preserveState) {
    if (!isVisible) return null;

    const content = <MemoizedContent>{children}</MemoizedContent>;

    // Wrap with HeavyContentPauser if enabled
    return content;
  }

  if (!publicTab && status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-background/80 text-foreground animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block rounded-full bg-primary/20 p-2">
            <svg
              width="24"
              height="24"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                strokeWidth="2"
                className="stroke-primary"
              />
              <path
                d="M12 8v4l2 2"
                strokeWidth="2"
                className="stroke-primary"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-semibold text-lg">Sign in required</span>
        </div>
        <p className="text-muted-foreground mb-4 text-center max-w-xs">
          Please sign in to access this feature. Your session is required for
          personalized AI experiences.
        </p>
        <a
          href="/auth/Login"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/80 transition-colors shadow"
        >
          <span>Sign In</span>
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    );
  }

  // CSS-based visibility approach with optimized drag handling
  const content = (
    <div
      className={`h-full w-full transition-all duration-200 ease-in-out ${
        isVisible
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
      style={{
        display: isVisible ? "block" : "none",
        position: isVisible ? "relative" : "absolute",
        top: isVisible ? "0" : "-9999px",
        visibility: isVisible ? "visible" : "hidden",
      }}
      aria-hidden={!isVisible}
      data-tab-id={value}
      data-visible={isVisible}
    >
      {children}
    </div>
  );

  // Wrap with HeavyContentPauser if enabled
  return content;
};
