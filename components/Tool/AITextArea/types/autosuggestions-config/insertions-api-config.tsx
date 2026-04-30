import { MakeSystemPrompt } from ".";
import { FormattedMessage, Message } from "../../../../../types";

export interface InsertionsApiConfig {
  makeSystemPrompt: MakeSystemPrompt;
  fewShotMessages: FormattedMessage[];
  forwardedParams: { [key: string]: any } | undefined;
}

export const defaultInsertionsMakeSystemPrompt: MakeSystemPrompt = (
  textareaPurpose,
  contextString
) => {
  return `You are a versatile writing assistant helping the user insert new text into their existing work.
  
The user is writing some text.
The purpose is: \"${textareaPurpose}\"

The following external context is also provided. Use it to inform your suggestions when relevant!!!
\`\`\`
${contextString}
\`\`\`

The user will provide you with a prompt for an INSERTION into the text they are writing. 
Your job is to come up with an INSERTION into the text that the user would like to use, AS BEST YOU CAN.
Only insert a SHORT segment. Usually 1 sentence, or at most 1 paragraph.

Adjust yourself to the user's style and implied intent.

Make sure <TextBeforeCursor>+<YourInsertionSuggestion>+<TextAfterCursor> makes sense and flows well just like a human would write it with proper punctuation.

Do not include any markdown formatting in your suggestion.

The user will provide the text before and after the cursor, as well as the INSERTION prompt. You should use this to infer the best relevant insertion.
The conversation will be structured as follows:
<TextBeforeCursor>
<TextAfterCursor>
<InsertionPrompt>

<YourInsertionSuggestion>
`;
};

export const defaultInsertionsFewShotMessages: FormattedMessage[] = [
  {
    id: "1",
    role: "user",
    content:
      "<TextBeforeCursor>This morning I woke up and went straight to the grocery store</TextBeforeCursor>",
  },
  {
    id: "2",
    role: "user",
    content:
      "<TextAfterCursor>I was there I also picked up some apples, oranges, and bananas.</TextAfterCursor>",
  },
  {
    id: "3",
    role: "user",
    content: "<InsertionPrompt>I bought a big watermelon</InsertionPrompt>",
  },
  {
    id: "4",
    role: "assistant",
    content:
      ". When I arrived I went straight to the produce section and picked out a big watermelon, while ",
  },
  {
    id: "5",
    role: "user",
    content:
      '<TextBeforeCursor>The Optionholder, in the Optionholder\'s capacity as a holder of vested Options, hereby irrevocably and unconditionally agrees: (i) that the Optionholder shall be deemed an "Equityholder" under the Merger Agreement and shall be entitled to the rights and benefits, and subject to the obligations, of an "Equityholder" thereunder;</TextBeforeCursor>',
  },
  {
    id: "6",
    role: "user",
    content:
      "<TextAfterCursor>and (iii) to the appointment of the Equityholders' Representative pursuant to Section 10.7 of the Merger Agreement and to the provisions thereof.</TextAfterCursor>",
  },
  {
    id: "7",
    role: "user",
    content:
      "<InsertionPrompt>add section about the optionholder's pro rata share</InsertionPrompt>",
  },
  {
    id: "8",
    role: "assistant",
    content:
      ' (ii) that, for purposes of this Agreement and the Merger Agreement, the applicable percentage set forth opposite the name of the Optionholder in the Distribution Waterfall shall be such the Optionholder\'s "Pro Rata Share"; ',
  },
];

export const defaultInsertionsApiConfig: InsertionsApiConfig = {
  makeSystemPrompt: defaultInsertionsMakeSystemPrompt,
  fewShotMessages: defaultInsertionsFewShotMessages,
  forwardedParams: undefined,
};
