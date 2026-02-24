import {
  StreamingTextResponse,
  OpenAIStream,
  CreateMessage,
  JSONValue,
} from "ai";
import { NextResponse } from "next/server";
import type { ChatCompletionCreateParams } from "openai/resources/chat/index";
import { rateLimit } from "../../../services/rate-limit";
import { openai } from "../../../lib/openai";
export const runtime = "nodejs";
const entrepriseURL =
  process.env.NEXT_PUBLIC_ENTREPRISE_API ||
  "https://entrepriseapi.hypercho.com";

export default async function POST(req: Request) {
  const {
    userId,
    entrepriseId,
    messages,
    chatbotid,
    chatId,
    prompt,
    chatModel,
    businessInfo,
  } = await req.json();
  const message = messages[messages.length - 1];
  if (!userId) {
    //TODO: make a temp user for temp data storage delete after 24 hours
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const identifier = req.url + "-" + userId;
    const { success } = await rateLimit(identifier);
    if (!success) {
      return new NextResponse("Too many requests", { status: 429 });
    }

    const addData = await fetch(`${entrepriseURL}/Chat/addChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: chatId,
        chat: message.content,
        role: "user",
      }),
    });

    const addJson = await addData.json();
    if (addJson.status !== 200) {
      return new NextResponse("Fail to add chat", { status: 401 });
    }

    const releventInfo = await fetch(
      `${entrepriseURL}/Chatbot/getReleventDocs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbotId: chatbotid,
          input: message.content,
          entrepriseId,
        }),
      }
    );

    const releventDocsJson = await releventInfo.json();

    let releventDocs = "";
    if (releventDocsJson.status === 200) {
      releventDocs = await releventDocsJson.data[0];
    }
    const curDate = new Date().toLocaleDateString();
    const cutMessages = messages.length > 12 ? messages.slice(-12) : messages;
    const actualPrompt = `
      Current date: ${curDate}

      As an assistant, your role is to interact with clients clearly and helpfully. Ask one question at a time and make sure your communication is easy to understand and accurate.

      Below are the guidelines for interacting with users as an AI assistant. These are designed to ensure effective, efficient, and user-friendly interactions. Please follow these in all user engagements:

      Complete Information Before Acting: Only perform actions when you have all the needed information. If the user gives incomplete details, kindly ask for the missing parts. Don't use fake data like "John Doe." This applies to all actions that need user information.
      
      One Question at a Time: When you need information for an action, ask questions one by one. For instance, if you're setting up an appointment, first ask for the date, then wait for the answer before asking for the time.
      
      Be Friendly and Professional: Always speak in a polite and helpful way. Keep your tone encouraging, even when you need extra details or have to clarify something.
      
      Guide the User: When you ask for information, do it step by step. It should feel like a normal conversation, not like a survey. Help the user through each step.
      
      Remember, your main goal is to help clients effectively, using only the information they give you. Ensure you're accurate and efficient in meeting their needs and aiding them to achieve the company's objectives.

      Remember you don't have the access to schedule appointment.
      
      Here is the additional information specific to your company:

      - Company Name: ${businessInfo.businessName}
      - Email: ${businessInfo.businessEmail}
      - Phone: ${businessInfo.businessPhoneNumber}
      - Location: ${businessInfo.businessAddress}
      - Website: ${businessInfo.businessWebsite}

      Here is some related information that may be helpful to you:
      ${releventDocs}

      Here is the user prompt:
      ${prompt}
      `;

    const { openai } = await import("../../../lib/openai");

    // Do not auto-fill any fields with placeholder or dummy data.
    const functions: ChatCompletionCreateParams.Function[] = [
      {
        name: "schedule_appointment",
        description:
          "Schedule a new appointment with the current user for an in-store check up or home check up by asking client all the parameters and finally ask the user to confirm the appointment with all the information. Only call the function when the user is confirmed. Do not auto-fill any fields with placeholder or dummy data",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description:
                "The date of the appointment must be an actual date and a format of mm-dd-yyyy",
              default: "",
            },
            time: {
              type: "string",
              description:
                "The time of the appointment must convert am and pm to 24 hours format of hh:mm",
              default: "",
            },
            firstname: {
              type: "string",
              description: "The firstname of the person",
              default: "",
            },
            lastname: {
              type: "string",
              description: "The lastname of the person",
              default: "",
            },
            email: {
              type: "string",
              description: "The email of the person",
              default: "",
            },
            appointmentAddress: {
              type: "string",
              description:
                "does the person want the appointment at home or in-store or online",
              default: "",
            },
            phone: {
              type: "string",
              description:
                "The phone number of the person must convert into a format of (xxx) xxx-xxxx",
              default: "",
            },
          },
          required: [
            "date",
            "time",
            "firstname",
            "lastname",
            "email",
            "appointmentAddress",
            "phone",
          ],
        },
      },
    ];

    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        { role: "system", content: `${actualPrompt}` },
        ...cutMessages,
      ],
      stream: true,
      stop: ["######"],
    });

    return;
  } catch (error: any) {
    console.error("[CHAT_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
