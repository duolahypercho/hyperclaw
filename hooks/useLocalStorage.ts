import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    // Check if window is defined (client-side)
    if (typeof window === "undefined") {
      return typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue;
    }
    
    try {
      const jsonValue = localStorage.getItem(key);
      // Check for null, undefined string, or empty string
      if (jsonValue == null || jsonValue === "undefined" || jsonValue === "") {
        if (typeof initialValue === "function") {
          return (initialValue as () => T)();
        } else {
          return initialValue;
        }
      } else {
        return JSON.parse(jsonValue);
      }
    } catch (error) {
      // If JSON parsing fails, return initial value
      console.warn(`Error parsing localStorage value for key "${key}":`, error);
      if (typeof initialValue === "function") {
        return (initialValue as () => T)();
      } else {
        return initialValue;
      }
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error saving to localStorage for key "${key}":`, error);
    }
  }, [value, key]);

  return [value, setValue] as [T, typeof setValue];
}
