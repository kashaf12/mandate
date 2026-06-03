/**
 * Configuration for BackendClient.
 */
export interface BackendClientConfig {
  /** API key for authentication */
  apiKey: string;

  /** Backend base URL (e.g., http://localhost:3000) */
  backendUrl: string;

  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;

  /** Maximum number of retries for failed requests (default: 3) */
  maxRetries?: number;

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

/**
 * Internal request options.
 */
export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  body?: unknown;
  headers?: Record<string, string>;
}
