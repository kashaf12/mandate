import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true, // Run in single thread to avoid cleanup issues
      },
    },
  },
});
