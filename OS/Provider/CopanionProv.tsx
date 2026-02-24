import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";

interface CopanionContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

const CopanionContext = createContext<CopanionContextType | undefined>(
  undefined
);

export const useCopanion = () => {
  const context = useContext(CopanionContext);
  if (!context) {
    throw new Error("useCopanion must be used within a CopanionProvider");
  }
  return context;
};

interface CopanionProviderProps {
  children: ReactNode;
  seoSchema?: SEOSchema;
}

export function CopanionProvider({
  children,
  seoSchema,
}: CopanionProviderProps) {
  const [isInitialized, setIsInitialized] = useState(true); // Start as initialized
  const [isLoading, setIsLoading] = useState(false); // Start as not loading
  const [error, setError] = useState<Error | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Handle client-side mounting to prevent hydration mismatches
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Simplified initialization - no blocking operations
  useEffect(() => {
    // Only set loading if there's actual work to do
    // For now, we'll keep it simple and fast
    setIsInitialized(true);
    setIsLoading(false);
  }, []);

  // During SSR and initial hydration, always render the children
  // This prevents hydration mismatches
  if (!isMounted) {
    return (
      <CopanionContext.Provider
        value={{ isInitialized: true, isLoading: false, error: null }}
      >
        {children}
      </CopanionContext.Provider>
    );
  }

  // Only show loading for actual errors
  if (error) {
    return (
      <CopanionContext.Provider value={{ isInitialized, isLoading, error }}>
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <h2 className="text-lg font-semibold text-destructive">
            Error Loading App
          </h2>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </CopanionContext.Provider>
    );
  }

  return (
    <SEOProv schema={seoSchema}>
      <CopanionContext.Provider value={{ isInitialized, isLoading, error }}>
        {children}
      </CopanionContext.Provider>
    </SEOProv>
  );
}
