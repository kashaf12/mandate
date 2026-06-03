import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackendClient } from "../../src/backend/client";
import {
  BackendClientError,
  BackendServerError,
  BackendTimeoutError,
  BackendUnavailableError,
} from "../../src/backend/errors";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("BackendClient", () => {
  let client: BackendClient;

  beforeEach(() => {
    client = new BackendClient({
      apiKey: "test-api-key",
      backendUrl: "http://localhost:3000",
      timeout: 1000,
      maxRetries: 2,
    });
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("successful requests", () => {
    it("should make successful GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "test" }),
      });

      const result = await client.get("/test");

      expect(result).toEqual({ data: "test" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/test",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("should make successful POST request with body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "123" }),
      });

      const result = await client.post("/test", { name: "test" });

      expect(result).toEqual({ id: "123" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "test" }),
        })
      );
    });

    it("should strip trailing slash from backendUrl", async () => {
      const clientWithTrailingSlash = new BackendClient({
        apiKey: "test-key",
        backendUrl: "http://localhost:3000/",
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await clientWithTrailingSlash.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/test",
        expect.anything()
      );
    });
  });

  describe("error handling", () => {
    it("should throw BackendClientError on 4xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Bad request",
      } as Response);

      await expect(client.get("/test")).rejects.toThrow(BackendClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry on 4xx
    });

    it("should throw BackendServerError on 5xx", async () => {
      // Mock all retry attempts (initial + 2 retries = 3 total)
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Internal error",
      };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await expect(client.get("/test")).rejects.toThrow(BackendServerError);
    });

    it("should throw BackendTimeoutError on timeout", async () => {
      // Create an error that simulates AbortController abort
      // Mock all retry attempts
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      mockFetch.mockImplementation(() => Promise.reject(abortError));

      await expect(client.get("/test")).rejects.toThrow(BackendTimeoutError);
    });

    it("should throw BackendUnavailableError on network error", async () => {
      // Mock all retry attempts
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(client.get("/test")).rejects.toThrow(
        BackendUnavailableError
      );
    });
  });

  describe("retry logic", () => {
    it("should retry on 5xx errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Error",
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Error",
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);

      const result = await client.get("/test");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should NOT retry on 4xx errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Bad request",
      } as Response);

      await expect(client.get("/test")).rejects.toThrow(BackendClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should retry on network errors", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network failure"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);

      const result = await client.get("/test");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Error",
      } as Response);

      await expect(client.get("/test")).rejects.toThrow(BackendServerError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe("authentication", () => {
    it("should include Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("should include custom headers", async () => {
      const customClient = new BackendClient({
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        headers: {
          "X-Custom-Header": "custom-value",
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await customClient.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
            "X-Custom-Header": "custom-value",
          }),
        })
      );
    });
  });
});
