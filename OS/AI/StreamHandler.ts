import { StreamChunk, StreamError } from "./types";

export class StreamHandler {
  private decoder: TextDecoder;
  private buffer: string;
  public result: string;

  constructor() {
    this.decoder = new TextDecoder();
    this.buffer = "";
    this.result = "";
  }

  /**
   * Creates a ReadableStream from a Response object
   * @param response The Response object from the fetch request
   * @param signal Optional AbortSignal to cancel the stream
   * @returns A ReadableStream that emits the streamed text
   */
  public async *createStream(
    response: Response,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    if (!response.body) {
      throw new Error("Response body is not readable");
    }

    const reader = response.body.getReader();
    let abortHandler: (() => void) | null = null;

    try {
      // Set up abort listener to immediately cancel the reader when signal fires
      if (signal) {
        abortHandler = () => {
          try {
            reader.cancel("Aborted by user");
          } catch (e) {
          }
        };

        // If already aborted, cancel immediately
        if (signal.aborted) {
          reader.cancel("Aborted by user");
          return;
        }

        signal.addEventListener("abort", abortHandler);
      }

      while (true) {
        // Check if aborted before reading
        if (signal?.aborted) {
          break;
        }

        let done: boolean;
        let value: Uint8Array | undefined;

        try {
          // Race the read against the abort signal
          const readResult = await reader.read();
          done = readResult.done;
          value = readResult.value;
        } catch (readError) {
          // If the read was cancelled due to abort, exit gracefully
          if (signal?.aborted) {
            break;
          }
          throw readError;
        }

        // Check again after read completes
        if (signal?.aborted) {
          break;
        }

        if (done) {
          // Process any remaining data in the buffer
          if (this.buffer.length > 0) {
            for await (const chunk of this.processBuffer()) {
              if (signal?.aborted) break;
              yield chunk;
            }
          }
          break;
        }

        // Decode the chunk and add it to the buffer
        const chunk = this.decoder.decode(value, { stream: true });
        this.buffer += chunk;

        // Process complete lines from the buffer
        for await (const processedChunk of this.processBuffer()) {
          if (signal?.aborted) break;
          yield processedChunk;
        }
      }
    } catch (error) {
      // Handle abort errors silently - this is normal user behavior
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // Check if error message indicates cancellation
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("cancel") || errorMessage.includes("abort")) {
        return;
      }
      console.error("Error in stream processing:", error);
      throw error;
    } finally {
      // Remove the abort listener to prevent memory leaks
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      // Always cancel the reader to close the connection
      try {
        reader.cancel("Stream ended");
      } catch (e) {
      }
    }
  }

  /**
   * Process the buffer and emit complete lines
   * @param controller The ReadableStreamDefaultController
   */
  private async *processBuffer(): AsyncGenerator<string, void, unknown> {
    // Split on double newlines to properly handle SSE format
    const messages = this.buffer.split("\n\n");
    // Keep the last incomplete message in the buffer
    this.buffer = messages.pop() || "";

    for (const message of messages) {
      const lines = message.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6); // Remove 'data: ' prefix

          try {
            const parsedData = JSON.parse(data);
            // Extract the text content from the response
            const text = parsedData.chunk || parsedData.content || data;
            this.result += text;
            yield text;
          } catch (error) {
            // If parsing fails, use the raw data
            if (data) {
              yield data;
            }
          }
        }
      }
    }
  }

  /**
   * Handle stream errors and convert them to a standardized error format
   * @param error The error to handle
   * @param metadata Additional metadata to include in the error
   * @returns A standardized StreamError object
   */
  public static handleError(
    error: unknown,
    metadata?: Record<string, any>
  ): StreamError {
    if (error instanceof Error) {
      return {
        success: false,
        status: 500,
        code: "STREAM_ERROR",
        message: "An error occurred while processing the stream",
        error: error.message,
        metadata,
      };
    }

    return {
      success: false,
      status: 500,
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
      metadata,
    };
  }
}
