// Performance monitoring utilities

export const measurePerformance = (name: string, fn: () => void) => {
  if (typeof window !== 'undefined' && window.performance) {
    const start = performance.now();
    fn();
    const end = performance.now();
    const duration = end - start;

    if (duration > 100) { // Log slow operations > 100ms
      console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
    }
  } else {
    fn();
  }
};

export const measureAsyncPerformance = async (name: string, fn: () => Promise<void>) => {
  if (typeof window !== 'undefined' && window.performance) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    const duration = end - start;

    if (duration > 500) { // Log slow async operations > 500ms
      console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
    }
  } else {
    await fn();
  }
};

// Debounced function to prevent excessive calls
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): T => {
  let timeoutId: NodeJS.Timeout;

  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

// Throttle function for scroll/resize events
export const throttle = <T extends (...args: any[]) => void>(
  func: T,
  limit: number
): T => {
  let inThrottle: boolean;

  return ((...args: any[]) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }) as T;
};