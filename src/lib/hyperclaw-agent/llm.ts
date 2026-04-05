/**
 * Provider-agnostic LLM client.
 *
 * Calls whatever the user configured — Anthropic, OpenAI, or any
 * OpenAI-compatible endpoint. No UserManager in the loop.
 * Keys come from the user's config, stored on their VPS.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible';

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;      // for openai-compatible (e.g. Ollama, local)
  maxTokens?: number;
  temperature?: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
};

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LLMResponse = {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
  usage: { inputTokens: number; outputTokens: number };
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LLMClient {
  private config: Required<LLMConfig>;

  constructor(config: LLMConfig) {
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? '',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.3,
    };
  }

  async chat(
    system: string,
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    switch (this.config.provider) {
      case 'anthropic':
        return this.callAnthropic(system, messages, tools);
      case 'openai':
      case 'openai-compatible':
        return this.callOpenAI(system, messages, tools);
      default:
        throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Anthropic
  // ---------------------------------------------------------------------------

  private async callAnthropic(
    system: string,
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    const url = 'https://api.anthropic.com/v1/messages';

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system,
      messages: messages.map(toAnthropicMessage),
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      content: ContentBlock[];
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content,
      stopReason: data.stop_reason as LLMResponse['stopReason'],
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // OpenAI / OpenAI-compatible
  // ---------------------------------------------------------------------------

  private async callOpenAI(
    system: string,
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    // Convert to OpenAI format
    const oaiMessages: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
    ];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        oaiMessages.push({ role: msg.role, content: msg.content });
      } else {
        // Handle tool_use and tool_result blocks
        for (const block of msg.content) {
          if (block.type === 'text') {
            oaiMessages.push({ role: msg.role, content: block.text });
          } else if (block.type === 'tool_use') {
            oaiMessages.push({
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input) },
              }],
            });
          } else if (block.type === 'tool_result') {
            oaiMessages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content,
            });
          }
        }
      }
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: oaiMessages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const content: ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    const stopMap: Record<string, LLMResponse['stopReason']> = {
      stop: 'end_turn',
      tool_calls: 'tool_use',
      length: 'max_tokens',
    };

    return {
      content,
      stopReason: stopMap[choice.finish_reason] ?? 'end_turn',
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAnthropicMessage(msg: Message): Record<string, unknown> {
  return { role: msg.role, content: msg.content };
}
