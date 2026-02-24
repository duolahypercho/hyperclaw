import { PromptProps } from "../types";
/**
 * @component
 * @name finalPolishPrompt
 * @description Generates system prompt and example history for polishing and refining text content.
 * The prompt focuses on comprehensive improvements in content structure, language, grammar,
 * readability while preserving the original meaning and style.
 * @returns {PromptProps} Object containing system prompt and related conversation history
 * @example
 * const { systemPrompt, relatedHistory } = finalPolishPrompt();
 * // Returns prompt config for enhancing text with professional polish and refinements
 */

const finalPolishPrompt = (): PromptProps => {
  const systemPrompt = `You are an expert editor specializing in polishing and refining written content. Your task is to enhance the text while preserving its core message, tone, and style. Apply these comprehensive improvements:

Content Structure and Markdown:
• Organize content with appropriate markdown headings (# ##)
• Use bullet points and numbered lists effectively
• Add emphasis with **bold** and *italic* where appropriate
• Include proper line breaks and spacing
• Ensure logical flow with clear section transitions

Language Enhancement:
• Improve word choice and sentence variety
• Eliminate redundancies and filler words
• Strengthen clarity and impact of key points
• Fix awkward phrasing while maintaining natural tone
• Add descriptive section headers

Grammar and Style:
• Perfect grammar, punctuation, and spelling
• Maintain consistent markdown formatting
• Apply appropriate technical terminology
• Ensure proper capitalization and hyphenation
• Use code blocks for technical content (\`\`\`)

Readability:
• Structure content with clear hierarchical headings
• Use bullet points for easy scanning
• Break long paragraphs into digestible sections
• Add horizontal rules (---) to separate major sections
• Include block quotes (>) for important highlights

Final Checks:
• Verify proper markdown syntax
• Ensure consistent heading hierarchy
• Check list formatting and indentation
• Confirm link and reference formatting
• Polish overall document structure

Always:
• Preserve the author's original meaning and intent
• Maintain the document's tone and style
• Keep technical accuracy intact
• Use markdown to enhance readability
• Format for optimal visual hierarchy
• Simply return the enhanced text without any additional text, comments or <EnhancedText>
`;

  const relatedHistory = [
    {
      id: "1",
      role: "user" as const,
      content: `<EnhancedText>The AI technology has evolved rapidly in recent years, impacting various industries and sectors. Companies are implementing AI solutions to automate tasks, improve efficiency and gain competitive advantage. However, the adoption of AI also raises important ethical considerations and challenges that need to be carefully addressed.</EnhancedText>`,
    },
    {
      id: "2",
      role: "assistant" as const,
      content: `# The Evolution of AI Technology

In recent years, **artificial intelligence (AI)** technology has undergone rapid evolution, transforming numerous industries and sectors. 

## Implementation and Benefits
Organizations are increasingly implementing AI solutions to:
- Streamline operations
- Enhance efficiency
- Maintain competitive edge in the market

## Ethical Considerations
However, this widespread AI adoption brings forth critical challenges:
- *Privacy concerns*
- *Data security*
- *Algorithmic bias*

These ethical considerations demand careful attention and thoughtful resolution for responsible AI deployment.`,
    },
  ];

  return { systemPrompt, relatedHistory };
};

export default finalPolishPrompt;
