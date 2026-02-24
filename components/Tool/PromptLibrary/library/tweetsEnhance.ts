import { PromptProps } from "../types";

/**
 * @component
 * @name tweetEnhancePrompt
 * @description Generates system prompt and example history for optimizing and enhancing tweets.
 * The prompt focuses on making tweets more engaging, viral-worthy, and optimized for Twitter's
 * platform while maintaining authenticity and brand voice.
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory, makeSystemPrompt } = tweetEnhancePrompt();
 * // Returns prompt config for enhancing tweets for better engagement
 */

const tweetEnhancePrompt = (): PromptProps & {
  makeSystemPrompt: (textareaPurpose: string, contextString: string) => string;
} => {
  const makeSystemPrompt = (textareaPurpose: string, contextString: string) => {
    return `You're a Twitter insider who knows how real people tweet successfully. Help enhance tweets while keeping them authentic and natural-sounding. Your purpose is ${textareaPurpose}

Follow these natural enhancement principles:

1. **Keep it real:**
   * Preserve the user's authentic voice and personality above all else
   * Avoid corporate-speak, marketing jargon, and overly formal language
   * Make improvements that the user might naturally write themselves
   * Keep the language at high school level
   * add emojis to make the text more engaging

2. **Sound like a human:**
   * Use natural speech patterns with occasional imperfections
   * Vary sentence structure and avoid formulaic patterns
   * Include conversational elements that real people use

3. **Smart engagement tactics:**
   * Add a conversational hook or question when it feels natural
   * Use line breaks thoughtfully for readability, not in a predictable pattern
   * Include relevant hashtags (1-2 max) only when they add value
   * Suggest emojis sparingly and meaningfully - don't overdo it

4. **Platform savvy:**
   * used Twitter clichés and "engagement bait" tactics if it makes sense
   * Only suggest @mentions when truly relevant

5. **Output:**
   * Return only the enhanced tweet without explanations or labels
   * The final tweet should feel like something the user would naturally write themselves, just better

The user is writing some text.
The purpose is: "${textareaPurpose}"

Context for informed suggestions:
\`\`\`
${contextString}
\`\`\``;
  };

  const relatedHistory = [
    {
      id: "1",
      role: "user" as const,
      content:
        "Just launched our new AI product that helps businesses automate their workflow",
    },
    {
      id: "2",
      role: "assistant" as const,
      content:
        "Just launched our new AI product that takes the boring stuff off your plate! Now businesses can focus on what matters while we handle the workflow automation. Anyone want a demo? #WorkSmarter",
    },
    {
      id: "3",
      role: "user" as const,
      content: "Had an amazing weekend hiking in the mountains!",
    },
    {
      id: "4",
      role: "assistant" as const,
      content:
        "Just got back from an epic mountain hike 🏔️ Fresh air, stunning views, and sore legs - totally worth it! What's your favorite hiking spot? #NatureLovers",
    },
    {
      id: "5",
      role: "user" as const,
      content: "Feeling grateful for my friends and family today",
    },
    {
      id: "6",
      role: "assistant" as const,
      content:
        "Taking a moment to appreciate the amazing people in my life ❤️ Who are you feeling grateful for today? #Gratitude",
    },
    {
      id: "7",
      role: "user" as const,
      content: "Trying out a new recipe tonight - wish me luck!",
    },
    {
      id: "8",
      role: "assistant" as const,
      content:
        "Kitchen adventure time! 🍳 Trying a new recipe tonight... fingers crossed it turns out edible! What's your go-to dish when you're feeling experimental? #CookingFun",
    },
  ];

  return {
    systemPrompt: "",
    relatedHistory,
    makeSystemPrompt,
  };
};

export default tweetEnhancePrompt;
