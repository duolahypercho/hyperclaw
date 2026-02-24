import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";

export interface FormPersistenceConfig {
  formId: string;
  enablePersistence?: boolean;
  showUnsavedChangesWarning?: boolean;
  onFormClose?: (data: any, hasChanges: boolean) => void;
}

export interface FormPersistenceState {
  hasUnsavedChanges: boolean;
  lastSavedTime: number | null;
  savedData: any | null;
}

export interface FormPersistenceActions {
  saveFormData: (data: any) => void;
  clearSavedData: () => void;
  handleFormClose: () => void;
  restoreFormData: () => any | null;
  trackFormChanges: (isDirty: boolean, currentData?: any) => void;
}

// Single localStorage key for all form data
const FORM_STORAGE_KEY = "hypercho-form-persistence";

// Interface for the consolidated storage structure
interface FormStorageData {
  [formId: string]: {
    data: any;
    timestamp: number;
    version?: string;
  };
}

// Utility functions for managing the consolidated storage
const getFormStorage = (): FormStorageData => {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(FORM_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to read form storage:", error);
    return {};
  }
};

const setFormStorage = (storage: FormStorageData): void => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error("Failed to write form storage:", error);
  }
};

const getFormData = (
  formId: string
): { data: any; timestamp: number } | null => {
  const storage = getFormStorage();
  return storage[formId] || null;
};

const setFormData = (formId: string, data: any): void => {
  const storage = getFormStorage();
  storage[formId] = {
    data,
    timestamp: Date.now(),
    version: "1.0", // For future migrations
  };
  setFormStorage(storage);
};

const clearFormData = (formId: string): void => {
  const storage = getFormStorage();
  delete storage[formId];
  setFormStorage(storage);
};

const clearAllFormData = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FORM_STORAGE_KEY);
};

// Clean up old form data (older than 30 days)
const cleanupOldFormData = (): void => {
  const storage = getFormStorage();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let hasChanges = false;

  Object.keys(storage).forEach((formId) => {
    if (storage[formId].timestamp < thirtyDaysAgo) {
      delete storage[formId];
      hasChanges = true;
    }
  });

  if (hasChanges) {
    setFormStorage(storage);
  }
};

export const useFormPersistence = (
  config: FormPersistenceConfig
): [FormPersistenceState, FormPersistenceActions] => {
  const {
    formId,
    enablePersistence = true,
    showUnsavedChangesWarning = true,
    onFormClose,
  } = config;

  const { toast } = useToast();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentFormData, setCurrentFormData] = useState<any>(null);

  // Get saved data for this form
  const savedFormData = getFormData(formId);
  const lastSavedTime = savedFormData?.timestamp || null;

  // Save form data
  const saveFormData = useCallback(
    (data: any) => {
      if (!enablePersistence) return;

      try {
        setFormData(formId, data);
        setHasUnsavedChanges(false);
        setCurrentFormData(data);

        toast({
          title: "Saved",
          description: "Your progress has been saved",
          duration: 2000,
        });
      } catch (error) {
        console.error("Failed to save form data:", error);
        toast({
          title: "Save failed",
          description: "Failed to save your progress",
          variant: "destructive",
        });
      }
    },
    [enablePersistence, formId, toast]
  );

  // Clear saved form data
  const clearSavedData = useCallback(() => {
    if (enablePersistence) {
      clearFormData(formId);
      setHasUnsavedChanges(false);
      setCurrentFormData(null);
    }
  }, [enablePersistence, formId]);

  // Restore saved form data
  const restoreFormData = useCallback(() => {
    const saved = getFormData(formId);
    return saved?.data || null;
  }, [formId]);

  // Handle form closure
  const handleFormClose = useCallback(() => {
    if (hasUnsavedChanges && showUnsavedChangesWarning && currentFormData) {
      // Show confirmation dialog
      const shouldSave = window.confirm(
        "You have unsaved changes. Would you like to save them before closing?"
      );

      if (shouldSave) {
        saveFormData(currentFormData);
      }
    }

    onFormClose?.(savedFormData?.data || null, hasUnsavedChanges);
  }, [
    hasUnsavedChanges,
    showUnsavedChangesWarning,
    currentFormData,
    savedFormData,
    onFormClose,
    saveFormData,
  ]);

  // Track form changes
  const trackFormChanges = useCallback(
    (isDirty: boolean, currentData?: any) => {
      setHasUnsavedChanges(isDirty);
      if (currentData) {
        setCurrentFormData(currentData);
      }
    },
    []
  );

  // Handle beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && showUnsavedChangesWarning) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, showUnsavedChangesWarning]);

  // Cleanup old data on mount (run once)
  useEffect(() => {
    cleanupOldFormData();
  }, []);

  const state: FormPersistenceState = {
    hasUnsavedChanges,
    lastSavedTime,
    savedData: savedFormData?.data || null,
  };

  const actions: FormPersistenceActions = {
    saveFormData,
    clearSavedData,
    handleFormClose,
    restoreFormData,
    trackFormChanges,
  };

  return [state, actions];
};

// Utility function to get time ago string
export const getTimeAgo = (timestamp: number): string => {
  const timeAgo = Date.now() - timestamp;
  const minutesAgo = Math.floor(timeAgo / 60000);
  const hoursAgo = Math.floor(timeAgo / 3600000);
  const daysAgo = Math.floor(timeAgo / 86400000);

  if (minutesAgo < 1) return "Just saved";
  if (minutesAgo < 60)
    return `Saved ${minutesAgo} minute${minutesAgo > 1 ? "s" : ""} ago`;
  if (hoursAgo < 24)
    return `Saved ${hoursAgo} hour${hoursAgo > 1 ? "s" : ""} ago`;
  return `Saved ${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`;
};

// Utility functions for managing all form data
export const FormPersistenceUtils = {
  // Get all saved form data
  getAllFormData: (): FormStorageData => {
    return getFormStorage();
  },

  // Clear all form data
  clearAllFormData,

  // Get storage size (for debugging)
  getStorageSize: (): number => {
    if (typeof window === "undefined") return 0;
    const data = localStorage.getItem(FORM_STORAGE_KEY);
    return data ? new Blob([data]).size : 0;
  },

  // Get form count
  getFormCount: (): number => {
    const storage = getFormStorage();
    return Object.keys(storage).length;
  },

  // Export form data (for backup)
  exportFormData: (): string => {
    const storage = getFormStorage();
    return JSON.stringify(storage, null, 2);
  },

  // Import form data (for restore)
  importFormData: (data: string): boolean => {
    try {
      const parsed = JSON.parse(data);
      setFormStorage(parsed);
      return true;
    } catch (error) {
      console.error("Failed to import form data:", error);
      return false;
    }
  },

  // Clean up old data
  cleanupOldData: cleanupOldFormData,
};
