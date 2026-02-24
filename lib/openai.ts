import OpenAI from "openai";

export const openai = new OpenAI({
    organization: "org-g1r39vQKFR2DitMTUe7bR45R",
    apiKey: process.env.OPENAI_API_KEY,
});

