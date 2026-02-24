import { StreamHandler } from "./StreamHandler";
import { getAuthToken } from "$/lib/auth-token-cache";

export class StreamService {
  private decoder: TextDecoder;

  constructor() {
    this.decoder = new TextDecoder();
  }

  /**
   * Stream text from any API endpoint
   * @param endpoint The API endpoint to call
   * @param options The request options
   * @returns An async generator that yields text chunks
   */
  public async *streamText(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: any;
      signal?: AbortSignal;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Check if already aborted before starting
      if (options.signal?.aborted) {
        console.log("🌐 StreamService: signal already aborted, returning early");
        return;
      }

      console.log("🌐 StreamService: starting fetch with signal:", !!options.signal);
      const token = await getAuthToken();
      const response = await fetch(endpoint, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
      console.log("🌐 StreamService: fetch response received, status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response body:", errorText);

        // Create more specific error messages based on status codes
        let errorMessage = `HTTP error! status: ${response.status}, body: ${errorText}`;

        if (response.status === 429) {
          errorMessage = `Rate limit exceeded (429). Please wait before trying again. Response: ${errorText}`;
        } else if (response.status === 401) {
          errorMessage = `Authentication failed (401). Please check your session. Response: ${errorText}`;
        } else if (response.status >= 500) {
          errorMessage = `Server error (${response.status}). Please try again later. Response: ${errorText}`;
        }

        const error = new Error(errorMessage);
        error.name = `HTTP${response.status}`;
        throw error;
      }

      const streamHandler = new StreamHandler();
      // Pass the signal to createStream for proper abort handling
      yield* streamHandler.createStream(response, options.signal);
    } catch (error) {
      // Handle abort errors silently - this is normal user behavior
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("🌐 StreamService: AbortError caught - fetch was aborted (this is normal)");
        return;
      }
      console.error("StreamService error:", error);
      throw error;
    }
  }
}
