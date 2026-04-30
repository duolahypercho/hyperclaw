// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};

export const newMongoId = (): string => generateId();

/**
 * Compares two objects and returns the fields that have changed (dirty fields)
 * @param initialState - The original/initial state object
 * @param currentState - The current/modified state object
 * @param options - Configuration options for comparison
 * @returns Object containing only the fields that have changed
 */
export const getDirtyFields = <T extends Record<string, any>>(
  initialState: T | null,
  currentState: T | null,
  options: {
    deepCompare?: boolean;
    ignoreFields?: (keyof T)[];
    compareArrays?: boolean;
  } = {}
): Partial<T> => {
  const {
    deepCompare = true,
    ignoreFields = [],
    compareArrays = true,
  } = options;

  // If either state is null/undefined, return empty object
  if (!initialState || !currentState) {
    return {};
  }

  const dirtyFields: Partial<T> = {};

  // Helper function to compare values
  const isEqual = (a: any, b: any): boolean => {
    if (a === b) return true;

    if (a == null || b == null) return a === b;

    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (!compareArrays) return false;
        if (a.length !== b.length) return false;
        return a.every((item, index) => isEqual(item, b[index]));
      }

      if (Array.isArray(a) || Array.isArray(b)) return false;

      if (deepCompare) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        return keysA.every((key) => isEqual(a[key], b[key]));
      }
    }

    return false;
  };

  // Compare all fields
  for (const key in currentState) {
    // Skip ignored fields
    if (ignoreFields.includes(key as keyof T)) {
      continue;
    }

    const initialValue = initialState[key];
    const currentValue = currentState[key];

    if (!isEqual(initialValue, currentValue)) {
      dirtyFields[key] = currentValue;
    }
  }

  return dirtyFields;
};

/**
 * Checks if there are any differences between two objects
 * @param initialState - The original/initial state object
 * @param currentState - The current/modified state object
 * @param options - Configuration options for comparison
 * @returns Boolean indicating if there are any differences
 */
export const hasChanges = <T extends Record<string, any>>(
  initialState: T | null,
  currentState: T | null,
  options: {
    deepCompare?: boolean;
    ignoreFields?: (keyof T)[];
    compareArrays?: boolean;
  } = {}
): boolean => {
  const dirtyFields = getDirtyFields(initialState, currentState, options);
  return Object.keys(dirtyFields).length > 0;
};

/**
 * Gets a summary of changes between two objects
 * @param initialState - The original/initial state object
 * @param currentState - The current/modified state object
 * @param options - Configuration options for comparison
 * @returns Object with change summary information
 */
export const getChangeSummary = <T extends Record<string, any>>(
  initialState: T | null,
  currentState: T | null,
  options: {
    deepCompare?: boolean;
    ignoreFields?: (keyof T)[];
    compareArrays?: boolean;
  } = {}
): {
  hasChanges: boolean;
  dirtyFields: Partial<T>;
  changedFieldCount: number;
  changedFields: (keyof T)[];
} => {
  const dirtyFields = getDirtyFields(initialState, currentState, options);
  const changedFields = Object.keys(dirtyFields) as (keyof T)[];

  return {
    hasChanges: changedFields.length > 0,
    dirtyFields,
    changedFieldCount: changedFields.length,
    changedFields,
  };
};
