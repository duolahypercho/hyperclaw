import OpenAI from "openai";

// `organization` is optional. Most OpenAI accounts only have a single default
// org and can leave OPENAI_ORG_ID unset; multi-org users can scope requests by
// setting it in the environment. Cloud builds set both vars at deploy time.
export const openai = new OpenAI({
  organization: process.env.OPENAI_ORG_ID,
  apiKey: process.env.OPENAI_API_KEY,
});
