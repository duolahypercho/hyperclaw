import { useMemo } from "react";
import { lengthType, PromptProps } from "../types";

/**
 * @component
 * @name lengthControlPrompt
 * @description Generates system prompt and example history for controlling text length
 * @param length - The desired length modification type ("shorter"|"shortest"|"current"|"longer"|"longest")
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory } = lengthControlPrompt("shorter");
 * // Returns prompt config for shortening text to 50% length while preserving meaning
 */
const lengthControlPrompt = (length: lengthType): PromptProps => {
  const detailPrompt = () => {
    if (length.toLowerCase() === "shortest") {
      return `Guidelines for shortest (25% of original length of <EnhancedText>):

    • Create an ultra-concise version focusing only on essential core messages
    • Remove all non-critical details while preserving the main point
    • Maintain coherent flow even in shortened form`;
    }
    if (length.toLowerCase() === "shorter") {
      return `Guidelines for shorter (50% of original length of <EnhancedText>):
    • Produce a condensed version that balances brevity and detail
    • Keep secondary important points but trim supporting elements
    • Ensure all key concepts remain intact`;
    }
    if (length.toLowerCase() === "longer") {
      return `Guidelines for longer (125% of original length of <EnhancedText>):
    • Expand thoughtfully with relevant supporting details
    • Add meaningful examples and contextual information
    • Enhance descriptions while maintaining the original's flow
    • Include additional perspectives or implications where appropriate`;
    }
    if (length.toLowerCase() === "longest") {
      return `Guidelines for longest (150% of original length of <EnhancedText>):
    • Develop a comprehensive expansion of the original
    • Add detailed examples, analogies, and thorough explanations
    • Explore related concepts and broader context
    • Include relevant background information and implications
    • Maintain engagement despite the increased length`;
    }
    return "";
  };

  const systemPrompt = `You are an expert writer specializing in content optimization. Your task is to thoughtfully modify the text's length inside the <EnhancedText> tag to be ${length} while maintaining its essence, tone, style, and readability.

  ${detailPrompt()}

  Always ensure:
  • Preserve the original's tone, voice, and writing style
  • Maintain logical flow and coherent structure
  • Keep the text natural and engaging
  • Retain technical accuracy and factual correctness
  • Avoid redundancy and filler content
  • Simply return the enhanced text without any additional text, comments or <EnhancedText>`;

  const relatedHistory = (length: lengthType) => {
    if (length === "shortest") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "A golden sunset painted the meadow while crickets chirped at twilight, creating a serene moment.",
        },
      ];
    }

    if (length === "shorter") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "The golden sunset painted the sky in orange and pink, casting shadows across the meadow. A soft breeze carried the scent of jasmine as crickets chirped, marking twilight. Time stood still, and the world whispered its secrets.",
        },
      ];
    }

    if (length === "longer") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "The magnificent golden rays of the setting sun masterfully painted the evening sky in vibrant hues of orange and pink, casting elongated shadows that danced across the peaceful meadow below. A gentle breeze meandered through the swaying tall grass, carrying with it the enchanting and delicate scent of freshly blooming jasmine flowers. In the distance, the melodic and rhythmic chirping of crickets gradually began their evening symphony, heralding the magical arrival of twilight. This ethereal moment embodied pure serenity, where the passage of time appeared to pause completely, and the natural world seemed to share its mysterious and gentle secrets with any soul fortunate enough to pause and listen.",
        },
      ];
    }

    if (length === "longest") {
      return [
        {
          id: "2",
          role: "user" as const,
          content: `<EnhancedText>The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.</EnhancedText>`,
        },
        {
          id: "3",
          role: "assistant" as const,
          content:
            "The breathtaking spectacle unfolded as the magnificent golden rays of the setting sun masterfully painted the evening sky in a stunning array of vibrant hues, from deep oranges to delicate pinks, creating an artist's palette across the heavens. These waning rays cast long, dramatic shadows that stretched and danced across the tranquil meadow below, transforming the landscape into a canvas of light and shadow. A gentle, caressing breeze, nature's own messenger, meandered its way through the tall grass, causing the delicate stalks to sway in a hypnotic dance. This same breeze carried with it the intoxicating and sweet fragrance of freshly blooming jasmine flowers, their perfume adding another layer to this sensory masterpiece. In the distance, as if orchestrated by nature itself, the melodic and rhythmic chirping of crickets gradually began their evening symphony, their song announcing the magical transition from day to night. This ethereal moment perfectly embodied the essence of pure serenity, where the relentless march of time appeared to pause completely, allowing the natural world to share its mysterious and gentle secrets with any fortunate soul who took the time to stop, observe, and truly listen to the whispers of the universe around them.",
        },
      ];
    }

    return [
      {
        id: "2",
        role: "user" as const,
        content: `<EnhancedText>The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.</EnhancedText>`,
      },
      {
        id: "3",
        role: "assistant" as const,
        content:
          "The golden rays of the setting sun painted the sky in hues of orange and pink, casting long shadows across the quiet meadow. A soft breeze rustled through the tall grass, carrying with it the faint scent of blooming jasmine. Somewhere in the distance, the rhythmic chirping of crickets began, signaling the arrival of twilight. It was a moment of pure serenity, where time seemed to stand still, and the world whispered its gentle secrets to anyone willing to listen.",
      },
    ];
  };

  return { systemPrompt, relatedHistory: relatedHistory(length) };
};

export default lengthControlPrompt;
