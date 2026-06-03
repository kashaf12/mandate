/**
 * Base error for all backend-related errors.
 */
export class BackendError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "BackendError";

    // Node.js-specific: captureStackTrace improves stack traces
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, BackendError);
    }
  }
}

/**
 * Backend is unreachable (network error, timeout, etc.).
 */
export class BackendUnavailableError extends BackendError {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(`Backend unavailable: ${message}`);
    this.name = "BackendUnavailableError";

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, BackendUnavailableError);
    }
  }
}

/**
 * Backend returned 4xx error (client error).
 */
export class BackendClientError extends BackendError {
  constructor(statusCode: number, responseBody: string) {
    super(
      `Backend client error (${statusCode}): ${responseBody}`,
      statusCode,
      responseBody
    );
    this.name = "BackendClientError";

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, BackendClientError);
    }
  }
}

/**
 * Backend returned 5xx error (server error).
 */
export class BackendServerError extends BackendError {
  constructor(statusCode: number, responseBody: string) {
    super(
      `Backend server error (${statusCode}): ${responseBody}`,
      statusCode,
      responseBody
    );
    this.name = "BackendServerError";

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, BackendServerError);
    }
  }
}

/**
 * Request timed out.
 */
export class BackendTimeoutError extends BackendError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "BackendTimeoutError";

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, BackendTimeoutError);
    }
  }
}
