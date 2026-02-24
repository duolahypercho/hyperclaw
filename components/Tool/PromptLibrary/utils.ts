import { PromptVariable } from "./types";

/**
 * Substitutes variables in a prompt template with provided values
 * @param promptTemplate - The prompt template with variable placeholders like {{variableName}}
 * @param variables - Array of variable definitions
 * @param values - Object with variable values to substitute
 * @returns The prompt with variables substituted
 */
export const substituteVariables = (
  promptTemplate: string,
  variables: PromptVariable[],
  values: Record<string, string>
): string => {
  let result = promptTemplate;

  variables.forEach((variable) => {
    const placeholder = `{{${variable.name}}}`;
    const value = values[variable.name] || variable.defaultValue || placeholder;
    result = result.replace(new RegExp(placeholder, "g"), value);
  });

  return result;
};

/**
 * Extracts variable names from a prompt template
 * @param promptTemplate - The prompt template with variable placeholders
 * @returns Array of variable names found in the template
 */
export const extractVariableNames = (promptTemplate: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = promptTemplate.match(regex);

  if (!matches) return [];

  return matches.map((match) => match.slice(2, -2)); // Remove {{ and }}
};

/**
 * Validates that all required variables have values
 * @param variables - Array of variable definitions
 * @param values - Object with variable values
 * @returns Object with validation result and missing variables
 */
export const validateVariables = (
  variables: PromptVariable[],
  values: Record<string, string>
): { isValid: boolean; missingVariables: string[] } => {
  const requiredVariables = variables.filter((v) => v.required);
  const missingVariables = requiredVariables
    .filter((v) => !values[v.name] || values[v.name].trim() === "")
    .map((v) => v.name);

  return {
    isValid: missingVariables.length === 0,
    missingVariables,
  };
};

// Add this utility function at the top of the file, after imports
export const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
