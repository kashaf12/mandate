/**
 * Type guards for error handling in examples.
 */

import { MandateBlockedError } from "@mandate/sdk";

/**
 * Type guard to check if an error is a MandateBlockedError.
 */
export function isMandateBlockedError(
  error: unknown
): error is MandateBlockedError {
  return error instanceof MandateBlockedError;
}

/**
 * Type guard to check if an error is a standard Error.
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}
