// hooks/useProactive.ts
import { useEffect, useRef, useState } from "react";
import { Message } from "@OS/AI/shared";
import { randomId } from "@OS/AI/shared";
import { useOS } from "@OS/Provider/OSProv";
import { useAssistant } from "$/Providers/AssistantProv";
import { useCopanionChat } from "./use-copanion-chat_internal";

const isDevelopment = process.env.NEXT_PUBLIC_ENV === "development";

export function useProactive(
  condition: boolean,
  message: string,
  storageKey: string,
  stateValue: string | number | null = null, // The actual state we're tracking
  dependencies: any[] = [],
  useLocalStorage: boolean = false, // Use localStorage instead of sessionStorage for persistence across sessions
  useDatabase: boolean = false // Use database storage with localStorage caching
) {
  const { sendMessage, isLoading } = useCopanionChat();
  const { osSettings } = useOS();
  const notifiedRef = useRef(false);
  const previousStateRef = useRef<string | number | null>(null);
  const sendingRef = useRef(false); // Lock to prevent concurrent sends
  const syncingRef = useRef(false); // Lock to prevent concurrent database syncs
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const databaseCheckedRef = useRef(false);

  // Initialize database state on mount (only once)
  useEffect(() => {
    if (!useDatabase || databaseCheckedRef.current) return;

    const initializeDatabaseState = async () => {
      setIsDatabaseReady(true);
      databaseCheckedRef.current = true;
    };

    initializeDatabaseState();
  }, [useDatabase, storageKey]);

  // Sync to database in background (non-blocking)
  const syncToDatabase = async (_stateValue: string | number | null) => {
    if (!useDatabase || syncingRef.current) return;

    syncingRef.current = true;
    // Community Edition keeps proactive notification state in localStorage only.
    syncingRef.current = false;
  };

  useEffect(() => {
    if (
      isLoading ||
      !osSettings.copanion
    )
      return;

    // If using database, wait for initialization to complete
    if (useDatabase && !isDatabaseReady) {
      return;
    }

    // Choose storage mechanism based on flags
    const storage =
      useLocalStorage || useDatabase ? localStorage : sessionStorage;

    if (!sendMessage || !condition) {
      // Reset when condition becomes false
      if (!condition && previousStateRef.current !== null) {
        storage.removeItem(storageKey);
        previousStateRef.current = null;
        notifiedRef.current = false;
        sendingRef.current = false;
        // Also clear from database if using it
        if (useDatabase) {
          syncToDatabase(null);
        }
      }
      return;
    }

    // Get the stored state value from localStorage (fast path)
    const storedState = storage.getItem(storageKey);
    const currentState = stateValue !== null ? String(stateValue) : "true";

    // If state hasn't changed, we've already notified (check storage, not just ref)
    if (storedState === currentState) {
      // Restore notifiedRef from storage to prevent re-notification on refresh
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        previousStateRef.current = stateValue;
      }
      sendingRef.current = false; // Reset lock if state matches
      return;
    }

    // Additional guard: Check if we've already notified for this exact state value
    // This prevents race conditions where the effect runs twice before storage is updated
    if (
      notifiedRef.current &&
      previousStateRef.current !== null &&
      String(previousStateRef.current) === currentState
    ) {
      sendingRef.current = false; // Reset lock if already notified
      return;
    }

    // Lock guard: Prevent concurrent sends (React Strict Mode protection)
    if (sendingRef.current) {
      return;
    }

    // State changed or first time - update localStorage FIRST (fast, synchronous)
    // This makes the check-and-update atomic
    storage.setItem(storageKey, currentState);
    previousStateRef.current = stateValue;
    notifiedRef.current = true;
    sendingRef.current = true; // Set lock before sending

    // Sync to database in background (non-blocking, async)
    if (useDatabase) {
      syncToDatabase(stateValue).catch(() => {
        // Already handled in syncToDatabase
      });
    }

    // Now send notification
    const userMessage: Message = {
      id: randomId(),
      role: "user",
      content: `<environment_details><system_context>${message}</system_context><information_type>SystemState</information_type></environment_details>`,
    };

    /* console.log("userMessage", userMessage); */

    sendMessage(userMessage).finally(() => {
      // Release lock after message is sent (or fails)
      sendingRef.current = false;
    });
  }, [
    condition,
    sendMessage,
    message,
    storageKey,
    stateValue,
    useLocalStorage,
    useDatabase,
    isDatabaseReady,
    ...dependencies,
  ]);
}
