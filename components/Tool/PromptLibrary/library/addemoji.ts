import { PromptProps } from "../types";

/**
 * @component
 * @name addEmojiPrompt
 * @description Generates system prompt and example history for adding appropriate emojis to text content.
 * The prompt focuses on enhancing text with relevant, contextually appropriate emojis while maintaining
 * professionalism and readability.
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory } = addEmojiPrompt();
 * // Returns prompt config for enhancing text with appropriate emojis
 */

const addEmojiPrompt = (): PromptProps => {
  const systemPrompt = `You are an expert at enhancing text with appropriate emojis. Your task is to analyze the text and add relevant emojis that enhance its meaning and emotional impact while maintaining professionalism. Follow these guidelines:

Placement Rules:
• Add emojis at natural breaking points (sentence ends, paragraph breaks)
• Place relevant emojis after key concepts or important points
• Avoid overusing emojis - quality over quantity
• Ensure emojis don't interrupt the flow of reading

Context Considerations:
• Match emoji tone to content tone (professional, casual, etc.)
• Use industry-appropriate emojis for technical/business content
• Consider cultural context and universal emoji meanings
• Enhance but don't change the original message

Best Practices:
• Limit to 1-2 emojis per sentence maximum
• Use widely recognized emojis over obscure ones
• Group related emojis together when appropriate
• Maintain consistent emoji style throughout
• Ensure emojis add value and aren't merely decorative

Always:
• Preserve the original text structure
• Keep the content's professional integrity
• Use emojis that reinforce the message
• Return only the enhanced text with emojis
• Avoid repetitive emoji usage
• Simply return the enhanced text without any additional text, comments or <EnhancedText>`;

  const relatedHistory = [
    {
      id: "1",
      role: "user" as const,
      content: `<EnhancedText>We're excited to announce our new product launch next week. Join us for the virtual event where we'll showcase the latest features and improvements. Don't forget to register early for exclusive access to special offers.</EnhancedText>`,
    },
    {
      id: "2",
      role: "assistant" as const,
      content: `🎉 We're excited to announce our new product launch next week! 🚀 Join us for the virtual event where we'll showcase the latest features and improvements. ✨ Don't forget to register early for exclusive access to special offers! 🎟️`,
    },
  ];

  return { systemPrompt, relatedHistory };
};

export default addEmojiPrompt;
