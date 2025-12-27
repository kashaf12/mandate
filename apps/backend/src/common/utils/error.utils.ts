/**
 * Extract error message and stack trace from an error object.
 * Handles Error instances, strings, and other types safely.
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  stack: string | undefined;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      stack: undefined,
    };
  }

  return {
    message: JSON.stringify(error),
    stack: undefined,
  };
}
