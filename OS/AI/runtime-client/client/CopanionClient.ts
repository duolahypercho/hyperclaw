/**
 * Copanion API client for Hypercho OS.
 * Handles streaming chat, conversations, agents, and cancellation with retries and error handling.
 * @module OS/AI/runtime-client/client/CopanionClient
 */

import { StreamService } from "@OS/AI/StreamService";
import { AgentsResponse } from "@OS/AI/runtime/backend/agents";
import { GenerateCopanionResponseInput } from "@OS/AI/runtime";

/** Single conversation in list responses */
export interface ConversationListItem {
  _id: string;
  title: string;
  lastUpdated: string;
}

/** Pagination metadata for conversation lists */
export interface PaginatedConversation {
  limit: number;
  offset: number;
  totalCount: number;
  totalPages: number;
  currentPage: number;
  hasMore: boolean;
}

/** Response shape for get-all-conversations endpoint */
export interface GetAllConversationsResponse {
  conversations: ConversationListItem[];
  pagination: PaginatedConversation;
}

/** Image attachment in a chat message */
export interface ImageData {
  format: string;
  url: string;
}

/** Chat message payload (user/assistant/system) */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
  image?: ImageData;
}

/** Payload for creating or updating a conversation */
export interface ConversationRequest {
  initialMessages: ChatMessage[];
  conversationId: string;
}

/** Payload for deleting a conversation */
export interface DeleteConversationRequest {
  conversationId: string;
}

/** Retry behavior for fetch calls */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

// Check if error is retryable
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const message = error.message?.toLowerCase() || "";
  const retryablePatterns = [
    "network error",
    "failed to fetch",
    "timeout",
    "connection refused",
    "err_connection_refused",
    "net::err_connection_refused",
    "service unavailable",
    "gateway timeout",
    "bad gateway",
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

// Sleep utility for delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create a fetch function with retry logic
const createFetchFn = (
  signal?: AbortSignal,
  handleWarning?: (warning: string) => void,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
) => {
  return async (url: string, options: RequestInit = {}) => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Check if request was aborted
        if (signal?.aborted) {
          throw new Error("Request was aborted");
        }

        const result = await fetch(url, {
          ...options,
          signal,
          headers: options.headers,
        });

        if (result.status !== 200) {
          if (result.status >= 400 && result.status <= 500) {
            throw new Error(`HTTP ${result.status}: ${result.statusText}`);
          }
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Let abort errors pass through immediately
        if (
          lastError.message.includes("BodyStreamBuffer was aborted") ||
          lastError.message.includes("signal is aborted without reason") ||
          lastError.message.includes("Request was aborted")
        ) {
          throw lastError;
        }

        // Check if this is the last attempt or error is not retryable
        if (
          attempt === retryConfig.maxRetries ||
          !isRetryableError(lastError)
        ) {
          console.error("💥 Fetch error for URL:", url, lastError);
          throw new Error(`Network error: ${lastError.message}`);
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay *
          Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelay
        );

        console.warn(
          `🔄 Retrying request to ${url} in ${delay}ms (attempt ${attempt + 1
          }/${retryConfig.maxRetries + 1})`
        );

        // Wait before retrying
        await sleep(delay);
      }
    }

    // This should never be reached, but just in case
    throw new Error(`Network error: ${lastError?.message || "Unknown error"}`);
  };
};

/** Options for constructing a CopanionClient (base URL, auth, and callbacks) */
export interface CopanionClientOptions {
  url: string;
  publicApiKey?: string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  handleErrors?: (error: Error) => void;
  handleWarning?: (warning: string) => void;
}

/**
 * Client for the Copanion backend: streaming generation, conversations, agents, and cancel.
 * Uses StreamService for SSE, retries on network errors, and normalizes errors (rate limit, auth, 5xx).
 */
export class CopanionClient {
  private streamService: StreamService;
  private url: string;
  private publicApiKey?: string;
  private headers?: Record<string, string>;
  private credentials?: RequestCredentials;
  public handleErrors?: (error: Error) => void;
  public handleWarning?: (warning: string) => void;

  constructor(options: CopanionClientOptions) {
    this.streamService = new StreamService();
    this.url = options.url;
    this.publicApiKey = options.publicApiKey;
    this.headers = options.headers;
    this.credentials = options.credentials;
    this.handleErrors = options.handleErrors;
    this.handleWarning = options.handleWarning;
  }

  /**
   * Start a streaming copilot response. Yields text chunks; aborts cleanly on signal.
   * @param data - Messages and metadata (conversationId, threadId, extensions, etc.)
   * @param properties - Optional extra properties for the backend
   * @param signal - AbortSignal to stop generation (e.g. user click Stop)
   */
  generateCopanionResponse({
    data,
    properties,
    signal,
  }: {
    data: GenerateCopanionResponseInput & Record<string, any>;
    properties?: any;
    signal?: AbortSignal;
  }) {
    try {
      // API: POST {base}/Generate — streaming copilot response (SSE)
      const fullURL = `${this.url}/Generate`;

      const requestBody = {
        messages: data.messages || [],
        stream: true,
        // Include additional Hypercho-specific data
        metadata: data.metadata,
        conversationId: data.conversationId,
        threadId: data.threadId,
        runId: data.runId,
        frontend: data.frontend,
        extensions: data.extensions,
        agentSession: data.agentSession,
        agentStates: data.agentStates,
        forwardedParameters: data.forwardedParameters,
        properties: properties,
      };

      const streamGenerator = this.streamService.streamText(fullURL, {
        method: "POST",
        body: requestBody,
        signal: signal,
      });

      return this.wrapStreamWithErrorHandling(streamGenerator);
    } catch (error) {
      // Don't log or throw abort errors - stopping is a normal user action
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : String(error);

      const isAbortError =
        errorMessage.includes("aborted") ||
        errorMessage.includes("Stop was called") ||
        (error instanceof Error && error.name === "AbortError") ||
        ((error as any)?.name === "AbortError");

      if (isAbortError) {
        // Silently handle abort - this is normal user behavior
        // Return an empty async generator to maintain the contract
        return (async function* () {
          // Empty generator that immediately completes
        })();
      }

      console.error("❌ Error in generateCopanionResponse:", error);
      if (this.handleErrors) {
        this.handleErrors(error as Error);
      }
      throw error;
    }
  }

  /** Wraps the SSE generator: normalizes abort, rate limit, auth, and 5xx errors before rethrowing. */
  private async *wrapStreamWithErrorHandling(
    streamGenerator: AsyncGenerator<string, void, unknown>
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Use for-await loop for better abort handling
      for await (const value of streamGenerator) {
        yield value;
      }
    } catch (error) {
      // Check for DOMException AbortError first (most reliable check)
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      // Don't log or throw abort errors - stopping is a normal user action
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : String(error);

      const isAbortError =
        errorMessage.includes("aborted") ||
        errorMessage.includes("Stop was called") ||
        (error instanceof Error && error.name === "AbortError") ||
        ((error as any)?.name === "AbortError");

      if (isAbortError) {
        // Silently handle abort - this is normal user behavior, just stop yielding
        return;
      }

      console.error("❌ Error in generateCopanionResponse stream:", error);

      // Handle specific error types
      if (error instanceof Error) {
        // Check for rate limiting
        if (
          error.message.includes("429") ||
          error.message.includes("RATE_LIMIT_EXCEEDED")
        ) {
          const rateLimitError = new Error(
            "Rate limit exceeded. Please wait a moment before trying again."
          );
          rateLimitError.name = "RateLimitError";
          if (this.handleErrors) {
            this.handleErrors(rateLimitError);
          }
          throw rateLimitError;
        }

        // Check for authentication errors
        if (
          error.message.includes("401") ||
          error.message.includes("UNAUTHORIZED")
        ) {
          const authError = new Error(
            "Authentication failed. Please refresh your session and try again."
          );
          authError.name = "AuthenticationError";
          if (this.handleErrors) {
            this.handleErrors(authError);
          }
          throw authError;
        }

        // Check for server errors (5xx)
        if (
          error.message.includes("5") &&
          (error.message.includes("500") ||
            error.message.includes("502") ||
            error.message.includes("503") ||
            error.message.includes("504"))
        ) {
          const serverError = new Error(
            "Server error occurred. Please try again later."
          );
          serverError.name = "ServerError";
          if (this.handleErrors) {
            this.handleErrors(serverError);
          }
          throw serverError;
        }
      }

      // Handle all other errors
      if (this.handleErrors) {
        this.handleErrors(error as Error);
      }
      throw error;
    }
  }

  /** Fetch available agents (requires publicApiKey). */
  availableAgents() {
    // API: GET {base}/Agents — list available agents (auth required)
    const agentsUrl = `${this.url}/Agents`;
    if (!this.publicApiKey) {
      const error = new Error(
        "No authentication token available. Please wait for session to load."
      );
      if (this.handleErrors) {
        this.handleErrors(error);
      }
      throw error;
    }

    const fetchFn = createFetchFn(undefined, this.handleWarning);
    return fetchFn(agentsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Authentication failed. Please check your session token."
            );
          }
          throw new Error(
            `Failed to fetch agents: ${response.status} ${response.statusText}`
          );
        }

        const data: AgentsResponse = await response.json();
        return data;
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        throw error;
      });
  }

  /** Load persisted state for an agent in a thread. */
  loadAgentState(data: { threadId: string; agentName: string }) {
    // API: POST {base}/AgentState — load agent state by threadId + agentName
    const agentsUrl = `${this.url}/AgentState`;
    this.debugLog("Fetching agents from URL", agentsUrl);
    const fetchFn = createFetchFn();
    return fetchFn(agentsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load agent state: ${response.status} ${response.statusText}`
          );
        }

        const result = await response.json();
        return { data: result, errors: null };
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        console.error(error);
        return { data: null, errors: error };
      });
  }

  /** Fetch recent conversations (requires publicApiKey). */
  recentConversations() {
    // API: GET {base}/Conversation/recent — recent conversations (auth required)
    const fullURL = `${this.url}/Conversation/recent`;
    if (!this.publicApiKey) {
      const error = new Error(
        "No authentication token available. Please wait for session to load."
      );
      if (this.handleErrors) {
        this.handleErrors(error);
      }
      throw error;
    }

    const fetchFn = createFetchFn(undefined, this.handleWarning);

    return fetchFn(fullURL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Authentication failed. Please check your session token."
            );
          }
          throw new Error(
            `Failed to fetch recent conversations: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        return data;
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        throw error;
      });
  }

  /** Get or create a conversation by id with optional initial messages. */
  getOrCreateConversation({
    initialMessages,
    conversationId,
    signal,
  }: ConversationRequest & { signal?: AbortSignal }) {
    // API: POST {base}/Conversation — get or create conversation (body: chatId, initialMessages)
    const fullURL = `${this.url}/Conversation`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    return fetchFn(fullURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
      body: JSON.stringify({
        chatId: conversationId,
        initialMessages,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to create conversation: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        return data;
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        console.error(error);
        throw error;
      });
  }

  /** Update a conversation's messages (uses relative path; ensure base URL is set). */
  updateConversation({
    conversationId,
    initialMessages,
    signal,
  }: ConversationRequest & { signal?: AbortSignal }) {
    // API: PUT {base}/Conversation/:id — update conversation messages (body: initialMessages)
    const fullURL = `${this.url}/Conversation/${conversationId}`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    return fetchFn(fullURL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initialMessages }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to create conversation: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        return data;
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        console.error(error);
        throw error;
      });
  }

  /** Delete a conversation by id (uses relative path; ensure base URL is set). */
  deleteConversation({
    conversationId,
    signal,
  }: DeleteConversationRequest & { signal?: AbortSignal }) {
    // API: DELETE {base}/Conversation/:id — delete conversation
    const fullURL = `${this.url}/Conversation/${conversationId}`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    return fetchFn(fullURL, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to delete conversation: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        return { data };
      })
      .catch((error) => {
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        console.error(error);
        throw error;
      });
  }

  /** Get paginated list of conversations (uses publicApiKey when set). */
  getAllConversations({
    limit = 20,
    offset = 0,
    signal,
  }: {
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  } = {}) {
    // API: GET {base}/Conversations?limit=&offset= — paginated conversation list
    const fullURL = `${this.url}/Conversations?limit=${limit}&offset=${offset}`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    return fetchFn(fullURL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();

          if (response.status === 401) {
            throw new Error(
              "Authentication failed. Please check your session token."
            );
          }
          throw new Error(
            `Failed to fetch conversations: ${response.status} ${response.statusText}`
          );
        }

        const data: GetAllConversationsResponse = (await response.json()).data;
        return data;
      })
      .catch((error) => {
        console.error("💥 getAllConversations error:", error);
        if (this.handleErrors) {
          this.handleErrors(error as Error);
        }
        throw error;
      });
  }

  /** Revert the last user message in a conversation (no-op if endpoint returns 404). */
  revertLastUserMessage({
    conversationId,
    chatID,
    signal,
  }: {
    conversationId: string;
    chatID: string | null;
    signal?: AbortSignal;
  }) {
    // API: POST {base}/revertLastUserMessage — revert last user message (body: conversationId, chatID)
    const fullURL = `${this.url}/revertLastUserMessage`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    if (!chatID) {
      return Promise.resolve();
    }
    return fetchFn(fullURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
      body: JSON.stringify({ conversationId, chatID }),
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            return; // Silently handle missing endpoint
          }
          throw new Error(
            `Failed to revert last user message: ${response.status} ${response.statusText}`
          );
        }
      })
      .catch((error) => {
        // Don't call handleErrors for 404s - this is expected if endpoint doesn't exist
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes("404") && !errorMessage.includes("Not Found")) {
          if (this.handleErrors) {
            this.handleErrors(error as Error);
          }
          console.error(error);
        }
        // Re-throw only non-404 errors
        if (!errorMessage.includes("404") && !errorMessage.includes("Not Found")) {
          throw error;
        }
      });
  }

  /**
   * Cancel an in-flight generation. Backend should set isCancelled = true.
   * @param requestId - Client-generated request ID (preferred)
   * @param conversationId - Server conversation ID (may be null early)
   */
  cancelGeneration({
    requestId,
    conversationId,
    signal,
  }: {
    requestId?: string | null;
    conversationId?: string | null;
    signal?: AbortSignal;
  }) {
    // Must have at least one identifier
    if (!requestId && !conversationId) {
      return Promise.resolve();
    }

    // API: POST {base}/CancelGeneration — cancel in-flight generation (body: requestId?, conversationId?)
    const fullURL = `${this.url}/CancelGeneration`;
    const fetchFn = createFetchFn(signal, this.handleWarning);
    return fetchFn(fullURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.publicApiKey && {
          Authorization: `Bearer ${this.publicApiKey}`,
        }),
        ...this.headers,
      },
      credentials: this.credentials,
      body: JSON.stringify({
        requestId,
        conversationId,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          // Don't throw for 404s - endpoint may not exist on all backends
          if (response.status === 404) {
            return;
          }
          throw new Error(
            `Failed to cancel generation: ${response.status} ${response.statusText}`
          );
        }
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes("404") && !errorMessage.includes("Not Found")) {
          console.error("❌ Cancel generation error:", error);
        }
        // Don't throw - cancellation failing shouldn't break the UI
      });
  }

  /** Turn an async generator of strings into a ReadableStream; cancel() stops the generator and calls onCancel. */
  public asStream<S, T>(
    source: AsyncGenerator<string, void, unknown>,
    options?: { onCancel?: () => void }
  ) {
    const handleErrors = this.handleErrors;
    const onCancel = options?.onCancel;

    return new ReadableStream<S>({
      async start(controller) {
        try {
          for await (const chunk of source) {
            // Check if the stream is still enqueuable
            controller.enqueue(chunk as S);
          }

          // Only close if the stream hasn't been errored or closed already
          try {
            controller.close();
          } catch (e) {
            // Ignore "stream is already closed/errored" errors
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // 1. Handle Abort/Stop cases gracefully
          const isAbort =
            errorMessage.includes("aborted") ||
            errorMessage.includes("Stop was called") ||
            (error as any)?.name === "AbortError";

          if (isAbort) {
            try { controller.close(); } catch (e) { }
            return;
          }

          // 2. Format Structured Errors
          let streamError = error;
          if ((error as any).extensions?.visibility) {
            streamError = Object.assign(new Error(errorMessage), {
              graphQLErrors: [{ message: errorMessage, extensions: (error as any).extensions }],
            });
          }

          // 3. Error the controller and notify UI
          try {
            controller.error(streamError);
          } catch (e) { }

          if (handleErrors) {
            handleErrors(streamError as Error);
          }
        }
      },
      cancel(reason) {
        // CRITICAL: This stops the async generator (and thus the fetch) 
        // when you call reader.cancel() on the frontend
        if (source.return) {
          source.return();
        }
        // Also call the onCancel callback to abort the fetch signal
        if (onCancel) {
          onCancel();
        }
      }
    });
  }

  /** True if the parsed chunk looks like an error (message/code/status and error-like content). */
  private isErrorResponse(parsedChunk: Record<string, any>): boolean {
    // Check for common error indicators
    const errorIndicators = [
      "message",
      "error",
      "errors",
      "status",
      "code",
      "detail",
      "details",
    ];

    // Check if any error indicators exist
    const hasErrorIndicator = errorIndicators.some((indicator) =>
      parsedChunk.hasOwnProperty(indicator)
    );

    // Check for HTTP error status codes in message or status
    const hasErrorCode =
      parsedChunk.message && /\b(4\d{2}|5\d{2})\b/.test(parsedChunk.message);

    // Check for error keywords in message
    const hasErrorKeywords =
      parsedChunk.message &&
      /\b(invalid|error|failed|unauthorized|forbidden|not found|bad request|server error|timeout)\b/i.test(
        parsedChunk.message
      );

    return hasErrorIndicator && (hasErrorCode || hasErrorKeywords);
  }

  /** True if the raw chunk string contains error codes or keywords. */
  private isErrorString(chunk: string): boolean {
    // Check for HTTP status codes
    const hasErrorCode = /\b(4\d{2}|5\d{2})\b/.test(chunk);

    // Check for error keywords
    const hasErrorKeywords =
      /\b(invalid|error|failed|unauthorized|forbidden|not found|bad request|server error|timeout|exception)\b/i.test(
        chunk
      );

    // Check for JSON error structure indicators
    const hasErrorStructure = /"error"|"message"|"status"/.test(chunk);

    return hasErrorCode || hasErrorKeywords || hasErrorStructure;
  }

  /** Normalize error message, code, and status from a parsed error chunk. */
  private extractErrorInfo(parsedChunk: Record<string, any>): {
    message: string;
    code: string;
    status?: number;
  } {
    // Ensure parsedJsonChunk is an object
    if (typeof parsedChunk !== "object" || parsedChunk === null) {
      return {
        message: "Invalid error response format",
        code: "INVALID_ERROR_FORMAT",
        status: 500,
      };
    }

    // Try to extract error message
    let message =
      parsedChunk.message ||
      parsedChunk.error?.message ||
      parsedChunk.detail ||
      parsedChunk.details ||
      "An unknown error occurred";

    // Try to extract error code
    let code = parsedChunk.code || parsedChunk.error?.code || "UNKNOWN_ERROR";

    // Try to extract status code
    let status = parsedChunk.status;
    if (typeof status === "string" && /^\d+$/.test(status)) {
      status = parseInt(status);
    }

    // Extract status code from message if not found elsewhere
    if (!status && parsedChunk.message) {
      const statusMatch = parsedChunk.message.match(/\b(4\d{2}|5\d{2})\b/);
      if (statusMatch) {
        status = parseInt(statusMatch[1]);
        code = this.getErrorCodeFromStatus(status);
      }
    }

    return { message, code, status };
  }

  /** Map HTTP status to a string error code (e.g. 401 → UNAUTHORIZED). */
  private getErrorCodeFromStatus(status: number): string {
    if (status >= 400 && status < 500) {
      if (status === 400) return "BAD_REQUEST";
      if (status === 401) return "UNAUTHORIZED";
      if (status === 403) return "FORBIDDEN";
      if (status === 404) return "NOT_FOUND";
      if (status === 422) return "VALIDATION_ERROR";
      return "CLIENT_ERROR";
    } else if (status >= 500) {
      if (status === 500) return "INTERNAL_SERVER_ERROR";
      if (status === 502) return "BAD_GATEWAY";
      if (status === 503) return "SERVICE_UNAVAILABLE";
      if (status === 504) return "GATEWAY_TIMEOUT";
      return "SERVER_ERROR";
    }
    return "UNKNOWN_ERROR";
  }

  /** Recursively strip __typename from objects/arrays (e.g. before sending to non-GraphQL API). */
  static removeGraphQLTypename(data: any) {
    if (Array.isArray(data)) {
      data.forEach((item) => CopanionClient.removeGraphQLTypename(item));
    } else if (typeof data === "object" && data !== null) {
      delete data.__typename;
      Object.keys(data).forEach((key) => {
        if (typeof data[key] === "object" && data[key] !== null) {
          CopanionClient.removeGraphQLTypename(data[key]);
        }
      });
    }
    return data;
  }

  private debugLog(message: string, data?: any) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
    }
  }
}
