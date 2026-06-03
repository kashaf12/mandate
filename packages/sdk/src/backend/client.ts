import {
  BackendError,
  BackendUnavailableError,
  BackendClientError,
  BackendServerError,
  BackendTimeoutError,
} from "./errors";
import type { BackendClientConfig, RequestOptions } from "./types";

/**
 * HTTP client for Mandate backend communication.
 *
 * Features:
 * - Automatic retry with exponential backoff (5xx errors and network failures)
 * - Timeout handling
 * - Authentication (Bearer token)
 * - Proper error classification
 */
export class BackendClient {
  private apiKey: string;
  private backendUrl: string;
  private timeout: number;
  private maxRetries: number;
  private customHeaders: Record<string, string>;

  constructor(config: BackendClientConfig) {
    this.apiKey = config.apiKey;
    this.backendUrl = config.backendUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 5000;
    this.maxRetries = config.maxRetries ?? 3;
    this.customHeaders = config.headers ?? {};
  }

  /**
   * Make a GET request.
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>({
      method: "GET",
      endpoint,
    });
  }

  /**
   * Make a POST request.
   */
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>({
      method: "POST",
      endpoint,
      body,
    });
  }

  /**
   * Make a PUT request.
   */
  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>({
      method: "PUT",
      endpoint,
      body,
    });
  }

  /**
   * Make a DELETE request.
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>({
      method: "DELETE",
      endpoint,
    });
  }

  /**
   * Make an HTTP request with retry logic.
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(options);
      } catch (error) {
        lastError = error as Error;

        // Don't retry client errors (4xx)
        if (error instanceof BackendClientError) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries) {
          throw error;
        }

        // Retry on network errors and 5xx errors
        if (
          error instanceof BackendUnavailableError ||
          error instanceof BackendServerError ||
          error instanceof BackendTimeoutError
        ) {
          // Exponential backoff: 100ms, 200ms, 400ms, ...
          const delayMs = Math.min(Math.pow(2, attempt) * 100, 2000);
          await this.sleep(delayMs);
          continue;
        }

        // Unknown error - don't retry
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request (no retry logic).
   */
  private async executeRequest<T>(options: RequestOptions): Promise<T> {
    const url = `${this.backendUrl}${options.endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...this.customHeaders,
      ...options.headers,
    };

    let response: Response | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), this.timeout);

      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Handle timeout
      const err = error as { name?: string; message?: string };
      if (err.name === "AbortError") {
        throw new BackendTimeoutError(this.timeout);
      }

      // Handle network errors
      throw new BackendUnavailableError(
        err.message || "Network request failed",
        error as Error
      );
    }

    // At this point, response must be defined (TypeScript doesn't know this, so we assert)
    if (!response) {
      throw new BackendError("Unexpected: response is undefined");
    }

    // Handle HTTP errors
    if (!response.ok) {
      const responseBody = await this.safeReadResponse(response);

      // 4xx - Client error (don't retry)
      if (response.status >= 400 && response.status < 500) {
        throw new BackendClientError(response.status, responseBody);
      }

      // 5xx - Server error (retry)
      if (response.status >= 500) {
        throw new BackendServerError(response.status, responseBody);
      }

      // Other errors
      throw new BackendError(
        `HTTP error ${response.status}`,
        response.status,
        responseBody
      );
    }

    // Parse JSON response
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BackendError(
        "Failed to parse JSON response",
        response.status,
        await this.safeReadResponse(response)
      );
    }
  }

  /**
   * Safely read response body (handles already-consumed streams).
   */
  private async safeReadResponse(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "<failed to read response>";
    }
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
