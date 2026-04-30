/**
 * `usecopanionAdditionalInstructions` is a React hook that provides additional instructions
 * to the copanion.
 *
 * ## Usage
 *
 * ### Simple Usage
 *
 * In its most basic usage, usecopanionAdditionalInstructions accepts a single string argument
 * representing the instructions to be added to the copanion.
 *
 * ```tsx
 * import { usecopanionAdditionalInstructions } from "@copanionkit/react-core";
 *
 * export function MyComponent() {
 *   usecopanionAdditionalInstructions({
 *     instructions: "Do not answer questions about the weather.",
 *   });
 * }
 * ```
 *
 * ### Conditional Usage
 *
 * You can also conditionally add instructions based on the state of your app.
 *
 * ```tsx
 * import { usecopanionAdditionalInstructions } from "@copanionkit/react-core";
 *
 * export function MyComponent() {
 *   const [showInstructions, setShowInstructions] = useState(false);
 *
 *   usecopanionAdditionalInstructions({
 *     available: showInstructions ? "enabled" : "disabled",
 *     instructions: "Do not answer questions about the weather.",
 *   });
 * }
 * ```
 */
import { useEffect } from "react";
import { useCopanionContext } from "../context/copanion-context";

/**
 * Options for the useCopanionAdditionalInstructions hook.
 */
export interface UseCopanionAdditionalInstructionsOptions {
  /**
   * The instructions to be added to the copanion. Will be added to the instructions like so:
   *
   * ```txt
   * You are a helpful assistant.
   * Additionally, follow these instructions:
   * - Do not answer questions about the weather.
   * - Do not answer questions about the stock market.
   * ```
   */
  instructions: string;

  /**
   * Whether the instructions are available to the copanion.
   */
  available?: "enabled" | "disabled";
}

/**
 * Adds the given instructions to the copanion context.
 */
export function useCopanionAdditionalInstructions(
  {
    instructions,
    available = "enabled",
  }: UseCopanionAdditionalInstructionsOptions,
  dependencies?: any[]
) {
  const { setAdditionalInstructions } = useCopanionContext();

  useEffect(() => {
    if (available === "disabled") return;

    setAdditionalInstructions((prevInstructions) => [
      ...(prevInstructions || []),
      instructions,
    ]);

    return () => {
      setAdditionalInstructions(
        (prevInstructions) =>
          prevInstructions?.filter(
            (instruction) => instruction !== instructions
          ) || []
      );
    };
  }, [
    available,
    instructions,
    setAdditionalInstructions,
    ...(dependencies || []),
  ]);
}
