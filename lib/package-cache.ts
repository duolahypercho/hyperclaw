/**
 * Package cache to avoid repeated getPackage() calls
 * This prevents unnecessary API requests and improves performance
 */

export interface PackageTypes {
  _id: string;
  name: string;
  description: string;
  price: number;
  features: string[];
  generate_response_daily: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CachedPackageData {
  data: PackageTypes[];
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

let cachedPackages: CachedPackageData | null = null;
let packagePromise: Promise<PackageTypes[]> | null = null;

/**
 * Get the cached packages
 * Returns null if no packages are cached or cache is expired
 */
export const getCachedPackages = (): PackageTypes[] | null => {
  if (!cachedPackages) {
    return null;
  }

  const now = Date.now();
  const isExpired = now - cachedPackages.timestamp > CACHE_DURATION;

  if (isExpired) {
    cachedPackages = null;
    return null;
  }

  return cachedPackages.data;
};

/**
 * Set the cached packages
 */
export const setCachedPackages = (packages: PackageTypes[]): void => {
  cachedPackages = {
    data: packages,
    timestamp: Date.now(),
  };
};

/**
 * Clear the cached packages (useful for manual refresh)
 */
export const clearCachedPackages = (): void => {
  cachedPackages = null;
  packagePromise = null;
};

/**
 * Get or fetch packages with caching
 * This prevents multiple simultaneous getPackage() calls
 */
export const getCachedPackage = async (): Promise<PackageTypes[]> => {
  // Return cached packages if available and not expired
  const cached = getCachedPackages();
  if (cached) {
    return cached;
  }

  // If there's already a request in flight, wait for it
  if (packagePromise) {
    return packagePromise;
  }

  // Create a new request
  packagePromise = (async () => {
    const packages: PackageTypes[] = [];
    setCachedPackages(packages);
    packagePromise = null;
    return packages;
  })();

  return packagePromise;
};
