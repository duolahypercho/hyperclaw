import { PromptProps } from "../types";

/**
 * @component
 * @name addMarkdownPrompt
 * @description Generates system prompt and example history for adding appropriate markdown formatting to text content.
 * The prompt focuses on enhancing text with proper markdown syntax while maintaining readability and structure.
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory } = addMarkdownPrompt();
 * // Returns prompt config for enhancing text with markdown formatting
 */

const addMarkdownPrompt = (): PromptProps => {
  const systemPrompt = `You are an expert at enhancing text with markdown formatting. Your task is to analyze the text and add appropriate markdown syntax to improve its structure and readability. Follow these guidelines:

Heading Guidelines:
• Use # for main headings (H1)
• Use ## for subheadings (H2)
• Ensure heading hierarchy is logical and consistent

Text Formatting Rules:
• Use **bold** for emphasis on important terms
• Use *italics* for subtle emphasis or definitions
• Use \`code blocks\` for technical terms or commands
• Use > for notable quotes or callouts
• Use --- for thematic breaks where appropriate

List Formatting:
• Use - for unordered lists
• Use 1. 2. 3. for ordered lists
• Maintain consistent indentation for nested lists
• Add blank lines between list items for clarity

Link and Reference Guidelines:
• Use [text](URL) for hyperlinks
• Use ![alt text](image-url) for images
• Create reference-style links for repeated URLs
• Add meaningful alt text for images

Best Practices:
• Preserve the original content's meaning
• Maintain clean, readable markdown syntax
• Use consistent formatting throughout
• Add spacing for improved readability
• Structure content logically

Always:
• Keep the original message intact
• Enhance readability through proper formatting
• Use markdown syntax appropriately
• Return only the enhanced text with markdown
• Avoid overcomplicating the formatting
• Simply return the enhanced text without any additional text, comments or <EnhancedText>`;

  const relatedHistory = [
    {
      id: "1",
      role: "user" as const,
      content: `<EnhancedText>Welcome to Our Product Documentation
      
Getting Started
Our product helps you manage your tasks efficiently. You can create tasks, assign them to team members, and track progress.

Key Features
1. Task Creation
2. Team Assignment
3. Progress Tracking

Installation
Run npm install our-product to get started.

Note: Make sure you have Node.js installed.</EnhancedText>`,
    },
    {
      id: "2",
      role: "assistant" as const,
      content: `# Welcome to Our Product Documentation

## Getting Started
Our product helps you manage your tasks efficiently. You can create tasks, assign them to team members, and track progress.

## Key Features
1. Task Creation
2. Team Assignment
3. Progress Tracking

## Installation
Run \`npm install our-product\` to get started.

> **Note:** Make sure you have Node.js installed.`,
    },
  ];

  return {
    systemPrompt,
    relatedHistory,
  };
};

export default addMarkdownPrompt;
