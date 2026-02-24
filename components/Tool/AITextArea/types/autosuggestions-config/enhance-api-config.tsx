import { MakeSystemPrompt } from ".";
import { FormattedMessage } from "../../../../../types";



export interface EnhanceTextApiConfig {
  makeSystemPrompt: MakeSystemPrompt;
  fewShotMessages: FormattedMessage[];
  maxTokens?: number;
  stop?: string[];
}

export const defaultEnhanceTextMakeSystemPrompt: MakeSystemPrompt = (
  textareaPurpose,
  contextString
) => {
  return `You are an expert writing assistant

The user is writing some text.
The purpose is: \"${textareaPurpose}\"

Your job is to optimize the length of the user's text:

If the text is under 50 characters:
- Expand it with relevant details and context
- Add descriptive elements while maintaining the core message
- Ensure the expanded text remains focused and meaningful

If the text is over 50 characters:
- Condense it to be more concise
- Remove redundant or unnecessary information
- Preserve the key message and important details
- Maintain clarity while being succinct

Note: Include explicit whitespace characters in suggestions where needed.

Context for informed suggestions:
\`\`\`
${contextString}
\`\`\`
`;
};

export const defaultEnhanceTextFewShotMessages: FormattedMessage[] = [
  {
    id: "1",
    role: "user",
    content: "Call mom",
  },
  {
    id: "2",
    role: "assistant",
    content: "Call Mom – Check in and Share Updates.",
  },
];

export const defaultEnhanceTextApiConfig: EnhanceTextApiConfig = {
  makeSystemPrompt: defaultEnhanceTextMakeSystemPrompt,
  fewShotMessages: defaultEnhanceTextFewShotMessages,
};
